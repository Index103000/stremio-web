// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { useTranslation } = require('react-i18next');
const { usePlatform, useToast, copyTextToClipboard} = require('stremio/common');
const { default: usePlayOnDevice } = require('../usePlayOnDevice');
const Option = require('./Option');
const styles = require('./styles');

const OptionsMenu = React.memo(React.forwardRef(({ className, stream, playbackDevices, extraSubtitlesTracks, selectedExtraSubtitlesTrackId }, ref) => {
    const { t } = useTranslation();
    const platform = usePlatform();
    const toast = useToast();
    const { streamingUrl, playOnDevice } = usePlayOnDevice(stream);
    const [downloadUrl, magnetUrl] = React.useMemo(() => {
        return stream !== null ?
            stream.deepLinks &&
            stream.deepLinks.externalPlayer &&
            [
                stream.deepLinks.externalPlayer.download,
                stream.deepLinks.externalPlayer.magnet,
            ]
            :
            [null, null];
    }, [stream]);
    const externalDevices = React.useMemo(() => {
        return playbackDevices.filter(({ type }) => type === 'external');
    }, [playbackDevices]);

    const subtitlesTrackUrl = React.useMemo(() => {
        const track = extraSubtitlesTracks?.find(({ id }) => id === selectedExtraSubtitlesTrackId);
        return track?.fallbackUrl ?? track?.url ?? null;
    }, [extraSubtitlesTracks, selectedExtraSubtitlesTrackId]);

    const onCopyStreamButtonClick = React.useCallback(async () => {
        const url = streamingUrl || downloadUrl;

        if (!url) {
            return;
        }

        try {
            await copyTextToClipboard(url);

            toast.show({
                type: 'success',
                title: 'Copied',
                message: t('PLAYER_COPY_STREAM_SUCCESS'),
                timeout: 3000
            });
        } catch (e) {
            console.error(e);

            toast.show({
                type: 'error',
                title: t('ERROR'),
                message: `${t('PLAYER_COPY_STREAM_ERROR')}: ${url}`,
                timeout: 3000
            });

            // Last-resort fallback.
            //
            // This still lets the user manually copy the URL when the browser
            // blocks both the modern Clipboard API and execCommand().
            window.prompt('Copy stream link:', url);
        }
    }, [streamingUrl, downloadUrl, toast, t]);

    const onCopyMagnetButtonClick = React.useCallback(async () => {
        if (!magnetUrl) {
            return;
        }

        try {
            await copyTextToClipboard(magnetUrl);

            toast.show({
                type: 'success',
                title: 'Copied',
                message: t('PLAYER_COPY_MAGNET_LINK_SUCCESS'),
                timeout: 3000
            });
        } catch (e) {
            console.error(e);

            toast.show({
                type: 'error',
                title: t('ERROR'),
                message: `${t('PLAYER_COPY_MAGNET_LINK_ERROR')}: ${magnetUrl}`,
                timeout: 3000
            });

            window.prompt('Copy magnet link:', magnetUrl);
        }
    }, [magnetUrl, toast, t]);

    const onDownloadVideoButtonClick = React.useCallback(() => {
        if (downloadUrl) {
            platform.openExternal(downloadUrl);
        }
    }, [downloadUrl]);

    const onDownloadSubtitlesClick = React.useCallback(() => {
        subtitlesTrackUrl && platform.openExternal(subtitlesTrackUrl);
    }, [subtitlesTrackUrl]);

    const onMouseDown = React.useCallback((event) => {
        event.nativeEvent.optionsMenuClosePrevented = true;
    }, []);

    return (
        <div ref={ref} className={classnames(className, styles['options-menu-container'])} onMouseDown={onMouseDown}>
            {
                streamingUrl || downloadUrl ?
                    <Option
                        icon={'link'}
                        label={t('CTX_COPY_STREAM_LINK')}
                        disabled={stream === null}
                        onClick={onCopyStreamButtonClick}
                    />
                    :
                    null
            }
            {
                magnetUrl ?
                    <Option
                        icon={'magnet-link'}
                        label={t('CTX_COPY_MAGNET_LINK')}
                        disabled={stream === null}
                        onClick={onCopyMagnetButtonClick}
                    />
                    :
                    null
            }
            {
                downloadUrl ?
                    <Option
                        icon={'download'}
                        label={t('CTX_DOWNLOAD_VIDEO')}
                        disabled={stream === null}
                        onClick={onDownloadVideoButtonClick}
                    />
                    :
                    null
            }
            {
                subtitlesTrackUrl ?
                    <Option
                        icon={'download'}
                        label={t('CTX_DOWNLOAD_SUBS')}
                        disabled={stream === null}
                        onClick={onDownloadSubtitlesClick}
                    />
                    :
                    null
            }
            {
                streamingUrl && externalDevices.map(({ id, name }) => (
                    <Option
                        key={id}
                        icon={'vlc'}
                        label={t('PLAYER_PLAY_IN', { device: name })}
                        deviceId={id}
                        disabled={stream === null}
                        onClick={playOnDevice}
                    />
                ))
            }
        </div>
    );
}));

OptionsMenu.propTypes = {
    className: PropTypes.string,
    stream: PropTypes.object,
    playbackDevices: PropTypes.array,
    extraSubtitlesTracks: PropTypes.array,
    selectedExtraSubtitlesTrackId: PropTypes.string,
};

module.exports = OptionsMenu;
