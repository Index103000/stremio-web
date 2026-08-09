#!/usr/bin/env node

// Copyright (C) 2017-2023 Smart code 203358507

const INDEX_CACHE = 7200;
const ASSETS_CACHE = 2629744;
const HTTP_PORT = 8080;

// -----------------------------------------------------------------------------
// Stremio Streaming Server proxy configuration
// -----------------------------------------------------------------------------
//
// Browser-facing proxy path:
//
//   http://<stremio-web>/stremio-server/...
//
// Docker-internal target:
//
//   http://stremio-server:11470/...
//
// The browser never needs to access the Streaming Server container directly.
//
const STREMIO_SERVER_PROXY_PATH = '/stremio-server';

// Docker-internal Stremio Streaming Server.
//
// This can be overridden from Docker Compose:
//
//   STREMIO_SERVER_TARGET=http://stremio-server:11470
//
const STREMIO_SERVER_TARGET = (
    process.env.STREMIO_SERVER_TARGET ||
    'http://stremio-server:11470'
).replace(/\/+$/, '');

const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const build_path = path.resolve(__dirname, 'build');
const index_path = path.join(build_path, 'index.html');

const app = express();

// -----------------------------------------------------------------------------
// Stremio Streaming Server reverse proxy
// -----------------------------------------------------------------------------
//
// Keep the Streaming Server hidden inside the Docker network.
//
// Browser:
//
//   /stremio-server/settings
//   /stremio-server/<info_hash>/create
//   /stremio-server/<info_hash>/<file>
//   ...
//
// becomes:
//
//   http://stremio-server:11470/settings
//   http://stremio-server:11470/<info_hash>/create
//   http://stremio-server:11470/<info_hash>/<file>
//   ...
//
// Stremio Core may also generate stream URLs where:
//
//   Streaming Server URL:
//     http://host/stremio-server/
//
//   Stream path:
//     /yt/<id>
//
// are concatenated into:
//
//   /stremio-server//yt/<id>
//
// Therefore the proxy normalizes only the leading slash boundary of the
// upstream path:
//
//   /stremio-server//yt/<id>
//                     ↓
//   //yt/<id>
//                     ↓
//   /yt/<id>
//
// This normalization is intentionally performed after removing the proxy
// prefix. It does NOT normalize the complete URL and therefore cannot damage:
//
//   http://
//   https://
//
app.use(
    createProxyMiddleware({
        target: STREMIO_SERVER_TARGET,

        // Use the upstream target as the Host header.
        changeOrigin: true,

        // Preserve X-Forwarded-* information for the upstream server.
        xfwd: true,

        // Keep WebSocket proxying available in case Stremio Server uses it.
        ws: true,

        // Only proxy requests belonging to the Streaming Server prefix.
        pathFilter: (pathname) => (
            pathname === STREMIO_SERVER_PROXY_PATH ||
            pathname.startsWith(`${STREMIO_SERVER_PROXY_PATH}/`)
        ),

        // Remove the browser-facing /stremio-server prefix and normalize
        // duplicate leading slashes before forwarding to Stremio Server.
        //
        // Examples:
        //
        //   /stremio-server/settings
        //       -> /settings
        //
        //   /stremio-server//yt/jGAJCAuV3pQ
        //       -> /yt/jGAJCAuV3pQ
        //
        //   /stremio-server/
        //       -> /
        //
        pathRewrite: (requestPath) => {
            const upstreamPath = requestPath.slice(
                STREMIO_SERVER_PROXY_PATH.length
            );

            return `/${upstreamPath.replace(/^\/+/, '')}`;
        },

        on: {
            error: (error, req, res) => {
                console.error(
                    `[stremio-server-proxy] ${req.method} ${req.url}:`,
                    error.message
                );

                if (
                    res &&
                    typeof res.writeHead === 'function' &&
                    !res.headersSent
                ) {
                    res.writeHead(
                        502,
                        {
                            'Content-Type': 'application/json; charset=utf-8',
                        }
                    );

                    res.end(
                        JSON.stringify({
                            error: 'Stremio Streaming Server is unavailable',
                        })
                    );

                    return;
                }

                if (res && typeof res.destroy === 'function') {
                    res.destroy();
                }
            },
        },
    })
);

// -----------------------------------------------------------------------------
// Stremio Web static files
// -----------------------------------------------------------------------------

app.use(
    express.static(
        build_path,
        {
            setHeaders: (res, filePath) => {
                if (filePath === index_path) {
                    res.set(
                        'cache-control',
                        `public, max-age: ${INDEX_CACHE}`
                    );
                } else {
                    res.set(
                        'cache-control',
                        `public, max-age: ${ASSETS_CACHE}`
                    );
                }
            },
        }
    )
);

app.all(
    '*',
    (_req, res) => {
        // TODO: better 404 page
        res.status(404).send('<h1>404! Page not found</h1>');
    }
);

app.listen(
    HTTP_PORT,
    () => {
        console.info(`Server listening on port: ${HTTP_PORT}`);
        console.info(
            `Stremio Server proxy: ${STREMIO_SERVER_PROXY_PATH}/ -> ${STREMIO_SERVER_TARGET}/`
        );
    }
);