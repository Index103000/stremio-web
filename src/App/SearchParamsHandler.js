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
// Self-hosted Stremio Streaming Server proxy
// -----------------------------------------------------------------------------
//
// Stremio Core's default Streaming Server URL is:
//
//   http://127.0.0.1:11470/
//
// That is correct for the desktop application because the Streaming Server is
// running locally on the same machine.
//
// For the self-hosted Stremio Web deployment used by this fork, the Streaming
// Server is instead exposed through the Stremio Web origin:
//
//   http(s)://<stremio-web>/stremio-server/
//
// http_server.js then proxies those requests internally to:
//
//   http://stremio-server:11470/
//
// The browser therefore never needs to know the Docker service name or connect
// directly to port 11470.
//
const LOCAL_STREAMING_SERVER_PROXY_PATH = '/stremio-server/';

const normalizeServerUrl = (url) => (
    String(url || '').replace(/\/+$/, '')
);

const sameServerUrl = (left, right) => (
    normalizeServerUrl(left) === normalizeServerUrl(right)
);

const getLocalStreamingServerProxyUrl = () => (
    new URL(
        LOCAL_STREAMING_SERVER_PROXY_PATH,
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
        const currentSearchParams = getSearchParams();

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

            const localProxyUrl =
                getLocalStreamingServerProxyUrl();

            // -----------------------------------------------------------------
            // Explicit URL always wins
            // -----------------------------------------------------------------
            //
            // Preserve Stremio's existing ?streamingServerUrl=... behavior.
            //
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
            // Automatically migrate the official localhost default
            // -----------------------------------------------------------------
            //
            // Only replace Stremio's untouched default:
            //
            //   http://127.0.0.1:11470/
            //
            // If the user has explicitly configured another Streaming Server,
            // leave it untouched.
            //
            if (
                !sameServerUrl(
                    currentStreamingServerUrl,
                    DEFAULT_STREAMING_SERVER_URL
                )
            ) {
                return;
            }

            if (
                sameServerUrl(
                    currentStreamingServerUrl,
                    localProxyUrl
                )
            ) {
                return;
            }

            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'AddServerUrl',
                    args: localProxyUrl,
                },
            });

            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'UpdateSettings',
                    args: {
                        ...profile.settings,
                        streamingServerUrl: localProxyUrl,
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