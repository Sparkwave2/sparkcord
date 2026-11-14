# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Sparkcord web app image: the released Fluxer app-proxy image serving
# Sparkcord's web app. The assets come from the `app-assets` stage of
# fluxer_app_proxy/Dockerfile (built as sparkcord/app-assets:dev), which builds
# the SPA including its Rust/WASM modules inside Linux.

ARG BASE_IMAGE=ghcr.io/fluxerapp/fluxer-app-proxy-self-hosted@sha256:f00fbef202b52a3977cd8c85409ed65ea62529e541443e1c7b26be5ee57dd78c
ARG ASSETS_IMAGE=sparkcord/app-assets:dev

FROM ${ASSETS_IMAGE} AS assets

FROM ${BASE_IMAGE}
USER root
RUN rm -rf /srv/app/static
COPY --from=assets /assets /srv/app/static/
USER 65532:65532

LABEL org.opencontainers.image.title="sparkcord-app-proxy"
