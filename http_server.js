#!/usr/bin/env node

// Copyright (C) 2017-2023 Smart code 203358507

const INDEX_CACHE = 7200;
const ASSETS_CACHE = 2629744;
const HTTP_PORT = 8080;

// -----------------------------------------------------------------------------
// Stremio Streaming Server configuration
// -----------------------------------------------------------------------------
//
// Stremio Web and Stremio Streaming Server share the same browser-facing
// origin:
//
//   http://<host>:8080/
//
// Request resolution order:
//
//   1. Try to serve the request from Stremio Web's static build.
//   2. If Stremio Web does not contain the requested resource, forward the
//      request unchanged to Stremio Streaming Server.
//   3. If Stremio Streaming Server does not recognize the request either,
//      return its normal response, including its normal 404.
//
// Examples:
//
//   /
//       -> Stremio Web index.html
//
//   /main.<hash>.js
//       -> Stremio Web static asset
//
//   /settings
//       -> Stremio Streaming Server
//
//   /hlsv2/probe
//       -> Stremio Streaming Server
//
//   /yt/<videoId>
//       -> Stremio Streaming Server
//
//   /local-addon/manifest.json
//       -> Stremio Streaming Server
//
// Stremio Web itself uses hash-based client-side routes:
//
//   /#/search
//   /#/settings
//   /#/player/...
//
// Everything after "#" is handled entirely by the browser and is never sent
// to this HTTP server. Therefore:
//
//   /#/settings
//
// does not conflict with the Streaming Server endpoint:
//
//   /settings
//
// Docker-internal Stremio Streaming Server:
//
//   http://stremio-server:11470
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
// HTTP request logging
// -----------------------------------------------------------------------------
//
// Express does not log requests by default.
//
// Log every request after the response has completed so Docker logs contain:
//
//   method
//   URL
//   response status
//   elapsed time
//
// Example:
//
//   [http] GET /settings -> 200 4ms
//
//   [http] GET /hlsv2/probe?mediaURL=... -> 200 16ms
//
// console.log() writes to stdout, therefore the logs are visible through:
//
//   docker logs stremio-web
//
// or:
//
//   docker logs -f stremio-web
//
app.use(
    (req, res, next) => {
        const startedAt = process.hrtime.bigint();

        res.on(
            'finish',
            () => {
                const elapsedNs =
                    process.hrtime.bigint() - startedAt;

                const elapsedMs =
                    Number(elapsedNs) / 1_000_000;

                console.log(
                    `[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${elapsedMs.toFixed(1)}ms`
                );
            }
        );

        next();
    }
);

// -----------------------------------------------------------------------------
// Stremio Web static files
// -----------------------------------------------------------------------------
//
// express.static() falls through to the next middleware when the requested
// resource does not exist.
//
// Therefore:
//
//   existing Web resource
//       -> served here
//
//   unknown resource
//       -> continue to Stremio Streaming Server fallback
//
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

// -----------------------------------------------------------------------------
// Stremio Streaming Server fallback
// -----------------------------------------------------------------------------
//
// Every request not handled by Stremio Web is forwarded unchanged to Stremio
// Streaming Server.
//
// There is intentionally:
//
//   - no /stremio-server prefix;
//   - no path whitelist;
//   - no pathFilter;
//   - no pathRewrite.
//
// This allows Stremio's normal assumption that the Streaming Server is mounted
// at the root of an origin:
//
//   http://127.0.0.1:11470/
//
// to remain valid when using the self-hosted Web deployment.
//
// Examples:
//
// Browser:
//
//   GET /settings
//
// Upstream:
//
//   GET http://stremio-server:11470/settings
//
//
// Browser:
//
//   GET /hlsv2/probe?mediaURL=...
//
// Upstream:
//
//   GET http://stremio-server:11470/hlsv2/probe?mediaURL=...
//
//
// Browser:
//
//   GET /yt/jGAJCAuV3pQ
//
// Upstream:
//
//   GET http://stremio-server:11470/yt/jGAJCAuV3pQ
//
//
// Future Streaming Server endpoints also work automatically because this proxy
// does not maintain a list of supported server paths.
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

        on: {
            // -----------------------------------------------------------------
            // Proxy request logging
            // -----------------------------------------------------------------
            //
            // This is separate from the general [http] log above.
            //
            // It makes it immediately visible that Stremio Web did NOT contain
            // the requested path and the request therefore fell through to the
            // Streaming Server.
            //
            // Example:
            //
            //   [stremio-server-proxy]
            //   GET /settings
            //   -> http://stremio-server:11470/settings
            //
            proxyReq: (_proxyReq, req) => {
                console.log(
                    `[stremio-server-proxy] ${req.method} ${req.originalUrl} -> ${STREMIO_SERVER_TARGET}${req.originalUrl}`
                );
            },

            error: (error, req, res) => {
                console.error(
                    `[stremio-server-proxy] ${req.method} ${req.originalUrl}:`,
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

                if (
                    res &&
                    typeof res.destroy === 'function'
                ) {
                    res.destroy();
                }
            },
        },
    })
);

app.listen(
    HTTP_PORT,
    () => {
        console.info(
            `Server listening on port: ${HTTP_PORT}`
        );

        console.info(
            `Stremio Server fallback: unmatched Web requests -> ${STREMIO_SERVER_TARGET}`
        );
    }
);
