import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import magnet from 'magnet-uri';
import { useCore } from 'stremio/core';
import useToast from 'stremio/common/Toast/useToast';
import useTorrent from 'stremio/common/useTorrent';
import useStreamingServer from 'stremio/common/useStreamingServer';

const HTTP_REGEX = /^https?:\/\/.+/i;

// YouTube video IDs are currently 11 characters and use characters from
// [A-Za-z0-9_-].
//
// Supported URL examples:
//
//   https://www.youtube.com/watch?v=R4s4phvCZCk
//   https://youtube.com/watch?v=R4s4phvCZCk
//   https://m.youtube.com/watch?v=R4s4phvCZCk
//   https://music.youtube.com/watch?v=R4s4phvCZCk
//   https://youtu.be/R4s4phvCZCk
//   https://www.youtube.com/shorts/R4s4phvCZCk
//   https://www.youtube.com/live/R4s4phvCZCk
//   https://www.youtube.com/embed/R4s4phvCZCk
//
const YOUTUBE_VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

const extractYouTubeVideoId = (value: string): string | null => {
    try {
        const url = new URL(value);

        const hostname = url.hostname
            .toLowerCase()
            .replace(/^www\./, '');

        let videoId: string | null = null;

        // ---------------------------------------------------------------------
        // Short URL
        //
        //   https://youtu.be/<videoId>
        // ---------------------------------------------------------------------
        if (hostname === 'youtu.be') {
            videoId = url.pathname
                .split('/')
                .filter(Boolean)[0] ?? null;
        }

        // ---------------------------------------------------------------------
        // Standard YouTube URLs
        //
        //   https://youtube.com/watch?v=<videoId>
        //   https://m.youtube.com/watch?v=<videoId>
        //   https://music.youtube.com/watch?v=<videoId>
        // ---------------------------------------------------------------------
        else if (
            hostname === 'youtube.com' ||
            hostname === 'm.youtube.com' ||
            hostname === 'music.youtube.com'
        ) {
            if (url.pathname === '/watch') {
                videoId = url.searchParams.get('v');
            } else {
                const segments = url.pathname
                    .split('/')
                    .filter(Boolean);

                if (
                    segments.length >= 2 &&
                    (
                        segments[0] === 'shorts' ||
                        segments[0] === 'live' ||
                        segments[0] === 'embed'
                    )
                ) {
                    videoId = segments[1];
                }
            }
        }

        // ---------------------------------------------------------------------
        // Privacy-enhanced YouTube embed URL
        //
        //   https://www.youtube-nocookie.com/embed/<videoId>
        // ---------------------------------------------------------------------
        else if (hostname === 'youtube-nocookie.com') {
            const segments = url.pathname
                .split('/')
                .filter(Boolean);

            if (
                segments.length >= 2 &&
                segments[0] === 'embed'
            ) {
                videoId = segments[1];
            }
        }

        if (
            typeof videoId === 'string' &&
            YOUTUBE_VIDEO_ID_REGEX.test(videoId)
        ) {
            return videoId;
        }

        return null;
    } catch {
        return null;
    }
};

const usePlayUrl = () => {
    const navigate = useNavigate();
    const core = useCore();
    const toast = useToast();
    const { createTorrentFromMagnet } = useTorrent();
    const streamingServer = useStreamingServer();

    const handlePlayUrl = useCallback(async (text: string): Promise<boolean> => {
        if (!text || !text.trim()) return false;
        const trimmed = text.trim();

        // ---------------------------------------------------------------------
        // YouTube
        // ---------------------------------------------------------------------
        //
        // A YouTube watch URL is NOT a direct HTTP media stream.
        //
        // Do not pass:
        //
        //   https://www.youtube.com/watch?v=<videoId>
        //
        // to the generic HTTP stream handler. Doing that causes Stremio to
        // treat the YouTube HTML page as a media URL and eventually attempt
        // generic media/HLS probing.
        //
        // Instead, extract the YouTube video ID and create Stremio's native
        // YouTube StreamSource:
        //
        //   {
        //       ytId: "<videoId>"
        //   }
        //
        // Stremio Web can then select its native YouTubeVideo implementation,
        // which plays the video through the YouTube IFrame API.
        //
        const youtubeVideoId = extractYouTubeVideoId(trimmed);

        if (youtubeVideoId !== null) {
            toast.show({
                type: 'success',
                title: 'Loading YouTube video…',
                timeout: 3000
            });

            try {
                const encoded = await core.transport.encodeStream({
                    ytId: youtubeVideoId,
                });

                if (typeof encoded === 'string') {
                    navigate(
                        `/player/${encodeURIComponent(encoded)}`
                    );

                    return true;
                }
            } catch (e) {
                console.error(
                    'Failed to encode YouTube stream:',
                    e
                );
            }

            toast.show({
                type: 'error',
                title: 'Failed to load YouTube video.',
                timeout: 5000
            });

            return false;
        }

        // ---------------------------------------------------------------------
        // Generic HTTP / HTTPS media URL
        // ---------------------------------------------------------------------
        //
        // This branch is intentionally evaluated AFTER the YouTube branch.
        //
        // Otherwise a YouTube watch URL would match HTTP_REGEX and be treated
        // as a direct media stream.
        //
        if (HTTP_REGEX.test(trimmed)) {
            toast.show({
                type: 'success',
                title: 'Loading HTTP stream…',
                timeout: 3000
            });
            try {
                const encoded = await core.transport.encodeStream({
                    name: '',
                    description: '',
                    url: trimmed,
                });
                if (typeof encoded === 'string') {
                    navigate(`/player/${encodeURIComponent(encoded)}`);
                    return true;
                }
            } catch (e) {
                console.error('Failed to encode stream:', e);
            }
            toast.show({
                type: 'error',
                title: 'Failed to load HTTP stream.',
                timeout: 5000
            });
            return false;
        }

        const parsed = magnet.decode(trimmed);
        if (parsed && typeof parsed.infoHash === 'string') {
            const serverReady = streamingServer.settings !== null
                && streamingServer.settings.type === 'Ready';
            if (!serverReady) {
                toast.show({
                    type: 'error',
                    title: 'Streaming server is not available. Cannot play magnet links.',
                    timeout: 5000
                });
                return false;
            }
            createTorrentFromMagnet(trimmed);
            return true;
        }

        return false;
    }, [streamingServer.settings, createTorrentFromMagnet]);

    return { handlePlayUrl };
};

export default usePlayUrl;
