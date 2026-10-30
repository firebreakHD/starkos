# syntax=docker/dockerfile:1
FROM node:24.14.0-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8

ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    HOST=0.0.0.0 \
    PORT=4173 \
    STARK_ADDON=true \
    STARK_DATA_DIR=/data \
    GEV_KEY_SETUP_TRUSTED_PEERS=none

# SMB media sources are read through smbprotocol, the maintained Python
# implementation. The JavaScript clients available are refused by Samba,
# which is what Synology, QNAP and OpenMediaVault run.
RUN apt-get update \
    && apt-get install --no-install-recommends -y python3 python3-pip \
    && pip3 install --no-cache-dir --break-system-packages smbprotocol==1.17.0 \
    && apt-get purge -y python3-pip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY gods-eye-view/package.json gods-eye-view/package-lock.json ./
RUN npm ci
COPY gods-eye-view/ ./

# Home Assistant mounts /data/options.json as root-only. The entry process must
# read it before starting the web server; application access remains constrained
# by the Home Assistant container/AppArmor boundary.
RUN mkdir -p /data
EXPOSE 4173
CMD ["node", "scripts/docker-start.mjs"]
