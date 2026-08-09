// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const { deepEqual } = require('fast-equals');
const { useCore } = require('stremio/core');
const {
    withCoreSuspender,
    useProfile,
    useToast,
} = require('stremio/common');
const {
    DEFAULT_STREAMING_SERVER_URL,
} = require('stremio/common/CONSTANTS');

// -----------------------------------------------------------------------------
// Self-hosted Stremio Streaming Server
// -----------------------------------------------------------------------------
//
// Stremio Core's official default Streaming Server URL is:
//
//   http://127.0.0.1:11470/
//
// In this self-hosted deployment, Stremio Web and Stremio Streaming Server
// share the same browser-facing origin:
//
//   http(s)://<stremio-web>/
//
// http_server.js resolves requests in this order:
//
//   1. Stremio Web static files.
//   2. Stremio Streaming Server fallback.
//
// Therefore the browser-facing Streaming Server URL is simply:
//
//   window.location.origin + "/"
//
// Examples:
//
//   http://192.168.11.17:8083/
//
//   https://stremio.example.com/
//
// This keeps Stremio's normal root-based Streaming Server URL behavior intact
// and avoids path-prefix compatibility problems with endpoints such as:
//
//   /settings
//   /hlsv2/...
//   /yt/...
//   /local-addon/...
//
const normalizeServerUrl = (url) => (
    String(url || '').replace(/\/+$/, '')
);

const sameServerUrl = (left, right) => (
    normalizeServerUrl(left) === normalizeServerUrl(right)
);

const getLocalStreamingServerUrl = () => (
    new URL(
        '/',
        window.location.origin
    ).toString()
);

const getSearchParams = () => {
    const {
        origin,
        hash,
        search,
    } = window.location;

    const {
        searchParams,
    } = new URL(
        `${origin}${hash.replace('#', '')}${search}`
    );

    return Object.fromEntries(
        searchParams.entries()
    );
};

const SearchParamsHandler = () => {
    const core = useCore();
    const profile = useProfile();
    const toast = useToast();

    const [
        searchParams,
        setSearchParams,
    ] = React.useState(
        getSearchParams
    );

    const onLocationChange = () => {
        const currentSearchParams =
            getSearchParams();

        setSearchParams(
            (previousSearchParams) => (
                deepEqual(
                    previousSearchParams,
                    currentSearchParams
                )
                    ? previousSearchParams
                    : currentSearchParams
            )
        );
    };

    React.useEffect(
        () => {
            const {
                streamingServerUrl,
            } = searchParams;

            const currentStreamingServerUrl =
                profile.settings.streamingServerUrl;

            const localStreamingServerUrl =
                getLocalStreamingServerUrl();

            // -----------------------------------------------------------------
            // Explicit URL always wins
            // -----------------------------------------------------------------
            if (streamingServerUrl) {
                if (
                    sameServerUrl(
                        currentStreamingServerUrl,
                        streamingServerUrl
                    )
                ) {
                    return;
                }

                core.transport.dispatch({
                    action: 'Ctx',
                    args: {
                        action: 'UpdateSettings',
                        args: {
                            ...profile.settings,
                            streamingServerUrl,
                        },
                    },
                });

                core.transport.dispatch({
                    action: 'Ctx',
                    args: {
                        action: 'AddServerUrl',
                        args: streamingServerUrl,
                    },
                });

                toast.show({
                    type: 'success',
                    title: `Using streaming server at ${streamingServerUrl}`,
                    timeout: 4000,
                });

                return;
            }

            // -----------------------------------------------------------------
            // Already using the correct same-origin Streaming Server
            // -----------------------------------------------------------------
            if (
                sameServerUrl(
                    currentStreamingServerUrl,
                    localStreamingServerUrl
                )
            ) {
                return;
            }

            // -----------------------------------------------------------------
            // Automatically replace only Stremio's untouched official default
            // -----------------------------------------------------------------
            //
            //   http://127.0.0.1:11470/
            //
            // Any other manually configured Streaming Server URL is preserved.
            //
            if (
                !sameServerUrl(
                    currentStreamingServerUrl,
                    DEFAULT_STREAMING_SERVER_URL
                )
            ) {
                return;
            }

            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'AddServerUrl',
                    args: localStreamingServerUrl,
                },
            });

            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'UpdateSettings',
                    args: {
                        ...profile.settings,
                        streamingServerUrl:
                            localStreamingServerUrl,
                    },
                },
            });
        },
        [
            searchParams,
            profile.settings.streamingServerUrl,
        ]
    );

    React.useEffect(
        () => {
            onLocationChange();

            window.addEventListener(
                'hashchange',
                onLocationChange
            );

            return () => (
                window.removeEventListener(
                    'hashchange',
                    onLocationChange
                )
            );
        },
        []
    );

    return null;
};

module.exports = withCoreSuspender(
    SearchParamsHandler
);
