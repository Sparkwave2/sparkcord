// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord extended markdown (enabled by ParserFlags::ALLOW_EXTENDED):
// horizontal rules, $$ math blocks $$, footnote definitions, task-list markers and
// the footnote post-pass. Inline syntax (highlight, super/subscript, inline math,
// images, footnote references) lives in inline.rs.

use std::collections::HashMap;

use crate::ast::{ListItem, Node, ParserFlags};
use crate::parser::{MarkdownParser, ParseError};
use crate::text::Line;

const MAX_MATH_BLOCK_LINES: usize = 200;
const MAX_FOOTNOTE_ID_LEN: usize = 32;

pub(crate) fn enabled(flags: u32) -> bool {
    ParserFlags::has(flags, ParserFlags::ALLOW_EXTENDED)
}

/// `---`, `***` or `___` (three or more of the same character) on a line of its own.
pub(crate) fn is_rule_line(trimmed: &str) -> bool {
    let line = trimmed.trim_end();
    let Some(first) = line.bytes().next() else {
        return false;
    };
    matches!(first, b'-' | b'*' | b'_') && line.len() >= 3 && line.bytes().all(|byte| byte == first)
}

pub(crate) fn is_math_block_start(trimmed: &str) -> bool {
    trimmed.starts_with("$$")
}

/// Splits `[^id]: text` into (id, text, byte offset of text within `trimmed`).
pub(crate) fn footnote_definition(trimmed: &str) -> Option<(&str, &str, usize)> {
    let rest = trimmed.strip_prefix("[^")?;
    let close = rest.find(']')?;
    let id = &rest[..close];
    if !is_footnote_id(id) {
        return None;
    }
    let after = rest[close + 1..].strip_prefix(':')?;
    let body = after.trim_start();
    let body_offset = trimmed.len() - body.len();
    Some((id, body, body_offset))
}

pub(crate) fn is_footnote_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_FOOTNOTE_ID_LEN
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

pub(crate) fn is_block_start(line: &str, flags: u32) -> bool {
    enabled(flags)
        && (is_rule_line(line) || is_math_block_start(line) || footnote_definition(line).is_some())
}

/// Parses a `$$ ... $$` block starting at `current`. Returns the node and the next line index.
pub(crate) fn parse_math_block(lines: &[Line], current: usize) -> Option<(Node, usize)> {
    let first = lines[current].text.trim();
    let rest = first.strip_prefix("$$")?;
    if let Some(inner) = rest.strip_suffix("$$") {
        let inner = inner.trim();
        if inner.is_empty() {
            return None;
        }
        return Some((math_node(inner), current + 1));
    }
    let mut content = String::from(rest);
    let end = lines.len().min(current + MAX_MATH_BLOCK_LINES);
    for (index, line) in lines.iter().enumerate().take(end).skip(current + 1) {
        let text = line.text.trim_end();
        if let Some(before) = text.strip_suffix("$$") {
            content.push('\n');
            content.push_str(before);
            let content = content.trim();
            if content.is_empty() {
                return None;
            }
            return Some((math_node(content), index + 1));
        }
        content.push('\n');
        content.push_str(&line.text);
    }
    None
}

fn math_node(content: &str) -> Node {
    Node::Math {
        content: content.to_owned(),
        display: true,
    }
}

pub(crate) fn parse_footnote_definition(
    parser: &mut MarkdownParser,
    trimmed: &str,
    trimmed_offset: usize,
) -> Result<Option<Node>, ParseError> {
    let Some((id, body, body_offset)) = footnote_definition(trimmed) else {
        return Ok(None);
    };
    let children = crate::inline::parse_inline(parser, body, trimmed_offset + body_offset)?;
    Ok(Some(Node::FootnoteDefinition {
        id: id.to_owned(),
        index: 0,
        children,
    }))
}

/// Post-pass over the finished top-level AST: task markers and footnote numbering.
pub(crate) fn finalize(ast: &mut Vec<Node>) {
    for node in ast.iter_mut() {
        add_task_markers(node);
    }

    let mut definitions = Vec::new();
    let mut index_by_id: HashMap<String, usize> = HashMap::new();
    let mut kept = Vec::with_capacity(ast.len());
    for node in ast.drain(..) {
        match node {
            Node::FootnoteDefinition { id, children, .. } => {
                if index_by_id.contains_key(&id) {
                    continue;
                }
                let index = definitions.len() + 1;
                index_by_id.insert(id.clone(), index);
                definitions.push(Node::FootnoteDefinition {
                    id,
                    index,
                    children,
                });
            }
            other => kept.push(other),
        }
    }
    *ast = kept;
    for node in ast.iter_mut() {
        resolve_footnote_refs(node, &index_by_id);
    }
    for node in &mut definitions {
        resolve_footnote_refs(node, &index_by_id);
    }
    if !definitions.is_empty() {
        while matches!(ast.last(), Some(Node::Text { content }) if content.trim().is_empty()) {
            ast.pop();
        }
        ast.push(Node::Footnotes { items: definitions });
    }
}

fn add_task_markers(node: &mut Node) {
    if let Node::List { items, .. } = node {
        for item in items.iter_mut() {
            add_task_marker(item);
            for child in &mut item.children {
                add_task_markers(child);
            }
        }
        return;
    }
    if let Some(children) = children_mut(node) {
        for child in children {
            add_task_markers(child);
        }
    }
}

fn add_task_marker(item: &mut ListItem) {
    let Some(Node::Text { content }) = item.children.first_mut() else {
        return;
    };
    let checked = if content.starts_with("[ ]") {
        false
    } else if content.starts_with("[x]") || content.starts_with("[X]") {
        true
    } else {
        return;
    };
    let rest = &content[3..];
    if !(rest.is_empty() || rest.starts_with(' ')) {
        return;
    }
    let rest = rest.strip_prefix(' ').unwrap_or(rest).to_owned();
    if rest.is_empty() {
        item.children.remove(0);
    } else {
        *content = rest;
    }
    item.children.insert(0, Node::TaskMarker { checked });
}

fn resolve_footnote_refs(node: &mut Node, index_by_id: &HashMap<String, usize>) {
    if let Node::FootnoteRef { id, index } = node {
        match index_by_id.get(id.as_str()) {
            Some(found) => *index = *found,
            None => {
                *node = Node::Text {
                    content: format!("[^{id}]"),
                };
            }
        }
        return;
    }
    if let Node::List { items, .. } = node {
        for item in items {
            for child in &mut item.children {
                resolve_footnote_refs(child, index_by_id);
            }
        }
        return;
    }
    if let Some(children) = children_mut(node) {
        for child in children {
            resolve_footnote_refs(child, index_by_id);
        }
    }
}

fn children_mut(node: &mut Node) -> Option<&mut Vec<Node>> {
    match node {
        Node::Blockquote { children, .. }
        | Node::Strong { children }
        | Node::Emphasis { children }
        | Node::Underline { children }
        | Node::Strikethrough { children }
        | Node::Spoiler { children, .. }
        | Node::Heading { children, .. }
        | Node::Subtext { children }
        | Node::Sequence { children }
        | Node::TableCell { children }
        | Node::Alert { children, .. }
        | Node::Highlight { children }
        | Node::Superscript { children }
        | Node::Subscript { children }
        | Node::FootnoteDefinition { children, .. } => Some(children),
        Node::TableRow { cells } => Some(cells),
        _ => None,
    }
}

/// Plain text of an inline node tree (used for image alt text).
pub(crate) fn plain_text(node: &Node, out: &mut String) {
    match node {
        Node::Text { content } | Node::InlineCode { content } => out.push_str(content),
        Node::Link { text: Some(text), .. } => plain_text(text, out),
        Node::Strong { children }
        | Node::Emphasis { children }
        | Node::Underline { children }
        | Node::Strikethrough { children }
        | Node::Spoiler { children, .. }
        | Node::Sequence { children }
        | Node::Highlight { children }
        | Node::Superscript { children }
        | Node::Subscript { children } => {
            for child in children {
                plain_text(child, out);
            }
        }
        _ => {}
    }
}
