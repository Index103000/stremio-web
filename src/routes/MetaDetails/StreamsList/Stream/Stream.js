// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { default: Icon } = require('@stremio/stremio-icons/react');
const { t } = require('i18next');
const { useCore } = require('stremio/core');
const {
    useProfile,
    usePlatform,
    useToast,
    useBinaryState,
    copyTextToClipboard,
} = require('stremio/common');
const { Button, Image, Popup } = require('stremio/components');
const { default: useRouteFocused } = require('stremio/common/useRouteFocused');
const StreamPlaceholder = require('./StreamPlaceholder');
const styles = require('./styles');

const Stream = ({
    className,
    videoId,
    videoReleased,
    addonName,
    name,
    description,
    thumbnail,
    progress,
    deepLinks,
    ...props
}) => {
    const profile = useProfile();
    const toast = useToast();
    const platform = usePlatform();
    const core = useCore();
    const routeFocused = useRouteFocused();

    const [menuOpen, openMenu, closeMenu, toggleMenu] = useBinaryState(false);

    const popupLabelOnMouseUp = React.useCallback((event) => {
        if (!event.nativeEvent.togglePopupPrevented) {
            if (
                event.nativeEvent.ctrlKey ||
                event.nativeEvent.button === 2
            ) {
                event.preventDefault();
                openMenu();
            }
        }
    }, [openMenu]);

    const popupLabelOnContextMenu = React.useCallback((event) => {
        if (
            !event.nativeEvent.togglePopupPrevented &&
            !event.nativeEvent.ctrlKey &&
            !event.nativeEvent.shiftKey
        ) {
            event.preventDefault();
        }
    }, [toggleMenu]);

    const popupLabelOnLongPress = React.useCallback((event) => {
        if (
            event.nativeEvent.pointerType !== 'mouse' &&
            !event.nativeEvent.togglePopupPrevented
        ) {
            toggleMenu();
        }
    }, [toggleMenu]);

    const popupMenuOnPointerDown = React.useCallback((event) => {
        event.nativeEvent.togglePopupPrevented = true;
    }, []);

    const popupMenuOnContextMenu = React.useCallback((event) => {
        event.nativeEvent.togglePopupPrevented = true;

        if (
            !event.nativeEvent.ctrlKey &&
            !event.nativeEvent.shiftKey
        ) {
            event.preventDefault();
        }
    }, []);

    const popupMenuOnClick = React.useCallback((event) => {
        event.nativeEvent.togglePopupPrevented = true;
    }, []);

    const popupMenuOnKeyDown = React.useCallback((event) => {
        event.nativeEvent.buttonClickPrevented = true;
    }, []);

    const href = React.useMemo(() => {
        return deepLinks ?
            deepLinks.externalPlayer ?
                deepLinks.externalPlayer.web ?
                    deepLinks.externalPlayer.web
                    :
                    deepLinks.externalPlayer.openPlayer ?
                        deepLinks.externalPlayer.openPlayer[platform.name] ?
                            deepLinks.externalPlayer.openPlayer[platform.name]
                            :
                            deepLinks.externalPlayer.playlist
                        :
                        deepLinks.player
                :
                deepLinks.player
            :
            null;
    }, [deepLinks]);

    const download = React.useMemo(() => {
        return href === deepLinks?.externalPlayer?.playlist ?
            deepLinks.externalPlayer.fileName
            :
            null;
    }, [href, deepLinks]);

    const target = React.useMemo(() => {
        return href === deepLinks?.externalPlayer?.web ?
            '_blank'
            :
            null;
    }, [href, deepLinks]);

    const streamLink = React.useMemo(() => {
        return deepLinks?.externalPlayer?.streaming;
    }, [deepLinks]);

    const downloadLink = React.useMemo(() => {
        return deepLinks?.externalPlayer?.download;
    }, [deepLinks]);

    const magnetLink = React.useMemo(() => {
        return deepLinks?.externalPlayer?.magnet;
    }, [deepLinks]);

    // -------------------------------------------------------------------------
    // BitTorrent / P2P playback policy
    // -------------------------------------------------------------------------
    //
    // Torrent resources remain visible in the stream list because they are
    // still useful for resource discovery.
    //
    // However, direct Torrent playback through Stremio Streaming Server is
    // intentionally disabled in this custom build.
    //
    // Starting Torrent playback creates a Torrent engine in Stremio Streaming
    // Server. That engine may continue downloading after Web playback has been
    // closed, causing unexpected network traffic and resource consumption.
    //
    // Therefore:
    //
    //   - Torrent resources remain visible.
    //   - Direct Torrent playback is blocked.
    //   - Stream/download URLs generated by Stremio Server are hidden.
    //   - Magnet links remain available.
    //   - Clicking a Torrent resource copies its Magnet link instead.
    //
    // Stremio Core generates externalPlayer.magnet for Torrent streams, making
    // the Magnet link a reliable signal for this policy.
    //
    const isTorrent =
        typeof magnetLink === 'string' &&
        magnetLink.length > 0;

    // -------------------------------------------------------------------------
    // Prevent native Torrent navigation
    // -------------------------------------------------------------------------
    //
    // Button renders an <a> only when href is a non-empty string.
    //
    // For Torrent resources, removing href provides the first protection layer:
    //
    //   Torrent
    //       ↓
    //   href = null
    //       ↓
    //   no native anchor navigation
    //
    // The onClick handler below provides the second protection layer by also
    // preventing the normal Stremio playback flow.
    //
    const playableHref = isTorrent ? null : href;
    const playableTarget = isTorrent ? null : target;
    const playableDownload = isTorrent ? null : download;

    const markVideoAsWatched = React.useCallback(() => {
        if (typeof videoId === 'string') {
            core.transport.dispatch({
                action: 'MetaDetails',
                args: {
                    action: 'MarkVideoAsWatched',
                    args: [
                        {
                            id: videoId,
                            released: videoReleased,
                        },
                        true,
                    ],
                },
            });
        }
    }, [
        videoId,
        videoReleased,
    ]);

    // -------------------------------------------------------------------------
    // Stream primary action
    // -------------------------------------------------------------------------
    //
    // Normal streams:
    //
    //   keep Stremio's original playback behavior.
    //
    // Torrent streams:
    //
    //   1. block playback;
    //   2. copy the Magnet link;
    //   3. tell the user that the Magnet link is ready to use elsewhere.
    //
    const onClick = React.useCallback(async (event) => {
        if (event.nativeEvent.togglePopupPrevented) {
            return;
        }

        if (isTorrent) {
            event.preventDefault();
            event.stopPropagation();

            try {
                await copyTextToClipboard(magnetLink);

                toast.show({
                    type: 'info',
                    icon: 'magnet-link',
                    title: 'BT / P2P 资源不支持直接播放',
                    message: 'Magnet 链接已复制，可粘贴到支持 Magnet 下载的工具中下载。',
                    timeout: 6000,
                });
            } catch (error) {
                console.error(error);

                toast.show({
                    type: 'error',
                    icon: 'magnet-link',
                    title: 'BT / P2P 资源不支持直接播放',
                    message: 'Magnet 链接复制失败，请通过右键菜单手动复制。',
                    timeout: 6000,
                });
            }

            return;
        }

        if (profile.settings.playerType !== null) {
            markVideoAsWatched();

            toast.show({
                type: 'success',
                title: 'Stream opened in external player',
                timeout: 4000,
            });
        }

        if (typeof props.onClick === 'function') {
            props.onClick(event);
        }
    }, [
        isTorrent,
        magnetLink,
        props.onClick,
        profile.settings,
        markVideoAsWatched,
        toast,
    ]);

    // -------------------------------------------------------------------------
    // Copy Magnet link
    // -------------------------------------------------------------------------
    //
    // Use the shared clipboard helper so LAN HTTP deployments can fall back to
    // the legacy copy-event implementation when navigator.clipboard is not
    // available.
    //
    const copyMagnetLink = React.useCallback(async (event) => {
        event.preventDefault();
        closeMenu();

        if (!magnetLink) {
            return;
        }

        try {
            await copyTextToClipboard(magnetLink);

            toast.show({
                type: 'success',
                title: t('PLAYER_COPY_MAGNET_LINK_SUCCESS'),
                timeout: 4000,
            });
        } catch (error) {
            console.error(error);

            toast.show({
                type: 'error',
                title: t('PLAYER_COPY_MAGNET_LINK_ERROR'),
                timeout: 4000,
            });

            // Keep the existing manual fallback for the explicit context-menu
            // copy action.
            //
            // Do not use this fallback for the primary Torrent click because a
            // browser prompt appearing on ordinary stream selection would be
            // unnecessarily intrusive.
            //
            window.prompt(
                'Copy magnet link:',
                magnetLink
            );
        }
    }, [
        magnetLink,
        closeMenu,
        toast,
    ]);

    // -------------------------------------------------------------------------
    // Copy Stremio Streaming Server download link
    // -------------------------------------------------------------------------
    //
    // This action is only exposed for non-Torrent streams below.
    //
    // Torrent download links are Stremio Server HTTP wrappers around the
    // underlying Torrent engine and are therefore intentionally hidden.
    //
    const copyDownloadLink = React.useCallback(async (event) => {
        event.preventDefault();
        closeMenu();

        if (!downloadLink) {
            return;
        }

        try {
            await copyTextToClipboard(downloadLink);

            toast.show({
                type: 'success',
                title: t('PLAYER_COPY_DOWNLOAD_LINK_SUCCESS'),
                timeout: 4000,
            });
        } catch (error) {
            console.error(error);

            toast.show({
                type: 'error',
                title: t('PLAYER_COPY_DOWNLOAD_LINK_ERROR'),
                timeout: 4000,
            });

            window.prompt(
                'Copy download link:',
                downloadLink
            );
        }
    }, [
        downloadLink,
        closeMenu,
        toast,
    ]);

    // -------------------------------------------------------------------------
    // Copy Stremio Streaming Server stream link
    // -------------------------------------------------------------------------
    //
    // This action is also only exposed for non-Torrent streams below.
    //
    const copyStreamLink = React.useCallback(async (event) => {
        event.preventDefault();
        closeMenu();

        if (!streamLink) {
            return;
        }

        try {
            await copyTextToClipboard(streamLink);

            toast.show({
                type: 'success',
                title: t('PLAYER_COPY_STREAM_SUCCESS'),
                timeout: 4000,
            });
        } catch (error) {
            console.error(error);

            toast.show({
                type: 'error',
                title: t('PLAYER_COPY_STREAM_ERROR'),
                timeout: 4000,
            });

            window.prompt(
                'Copy stream link:',
                streamLink
            );
        }
    }, [
        streamLink,
        closeMenu,
        toast,
    ]);

    const renderThumbnailFallback = React.useCallback(() => (
        <Icon
            className={styles['placeholder-icon']}
            name={'ic_broken_link'}
        />
    ), []);

    // -------------------------------------------------------------------------
    // Stream list item
    // -------------------------------------------------------------------------
    //
    // Normal stream:
    //
    //   play icon
    //   navigable href
    //
    // Torrent stream:
    //
    //   Magnet icon
    //   no navigable href
    //   click copies Magnet instead of playing
    //
    const renderLabel = React.useMemo(
        () => function renderLabel({
            className,
            children,
            ...props
        }) {
            return (
                <Button
                    className={classnames(
                        className,
                        styles['stream-container']
                    )}
                    title={addonName}
                    href={playableHref}
                    target={playableTarget}
                    download={playableDownload}
                    onClick={onClick}
                    {...props}
                >
                    <div className={styles['info-container']}>
                        {
                            typeof thumbnail === 'string' &&
                            thumbnail.length > 0 ?
                                <div
                                    className={styles['thumbnail-container']}
                                    title={name || addonName}
                                >
                                    <Image
                                        className={styles['thumbnail']}
                                        src={thumbnail}
                                        alt={' '}
                                        renderFallback={renderThumbnailFallback}
                                    />
                                </div>
                                :
                                <div
                                    className={styles['addon-name-container']}
                                    title={name || addonName}
                                >
                                    <div className={styles['addon-name']}>
                                        {name || addonName}
                                    </div>
                                </div>
                        }

                        {
                            progress !== null &&
                            !isNaN(progress) &&
                            progress > 0 ?
                                <div
                                    className={styles['progress-bar-container']}
                                >
                                    <div
                                        className={styles['progress-bar']}
                                        style={{
                                            width: `${progress}%`,
                                        }}
                                    />

                                    <div
                                        className={
                                            styles['progress-bar-background']
                                        }
                                    />
                                </div>
                                :
                                null
                        }
                    </div>

                    <div
                        className={styles['description-container']}
                        title={description}
                    >
                        {description}
                    </div>

                    <Icon
                        className={styles['icon']}
                        name={
                            isTorrent ?
                                'magnet-link'
                                :
                                'play'
                        }
                    />

                    {children}
                </Button>
            );
        },
        [
            thumbnail,
            progress,
            addonName,
            name,
            description,
            playableHref,
            playableTarget,
            playableDownload,
            isTorrent,
            onClick,
        ]
    );

    // -------------------------------------------------------------------------
    // Context menu
    // -------------------------------------------------------------------------
    //
    // Torrent:
    //
    //   Copy Magnet Link
    //
    // Non-Torrent:
    //
    //   Play
    //   Copy Stream Link
    //   Copy Download Link
    //
    // This prevents Stremio-generated Torrent HTTP URLs from providing an
    // alternate path that could accidentally start a Torrent engine.
    //
    const renderMenu = React.useMemo(
        () => function renderMenu() {
            return (
                <div
                    className={styles['context-menu-content']}
                    onPointerDown={popupMenuOnPointerDown}
                    onContextMenu={popupMenuOnContextMenu}
                    onClick={popupMenuOnClick}
                    onKeyDown={popupMenuOnKeyDown}
                >
                    <div className={styles['context-menu-title']}>
                        {description}
                    </div>

                    {
                        !isTorrent &&
                            <Button
                                className={
                                    styles['context-menu-option-container']
                                }
                                title={t('CTX_PLAY')}
                            >
                                <Icon
                                    className={styles['menu-icon']}
                                    name={'play'}
                                />

                                <div
                                    className={
                                        styles['context-menu-option-label']
                                    }
                                >
                                    {t('CTX_PLAY')}
                                </div>
                            </Button>
                    }

                    {
                        !isTorrent &&
                        streamLink &&
                            <Button
                                className={
                                    styles['context-menu-option-container']
                                }
                                title={t('CTX_COPY_STREAM_LINK')}
                                onClick={copyStreamLink}
                            >
                                <Icon
                                    className={styles['menu-icon']}
                                    name={'link'}
                                />

                                <div
                                    className={
                                        styles['context-menu-option-label']
                                    }
                                >
                                    {t('CTX_COPY_STREAM_LINK')}
                                </div>
                            </Button>
                    }

                    {
                        magnetLink &&
                            <Button
                                className={
                                    styles['context-menu-option-container']
                                }
                                title={t('CTX_COPY_MAGNET_LINK')}
                                onClick={copyMagnetLink}
                            >
                                <Icon
                                    className={styles['menu-icon']}
                                    name={'magnet-link'}
                                />

                                <div
                                    className={
                                        styles['context-menu-option-label']
                                    }
                                >
                                    {t('CTX_COPY_MAGNET_LINK')}
                                </div>
                            </Button>
                    }

                    {
                        !isTorrent &&
                        downloadLink &&
                            <Button
                                className={
                                    styles['context-menu-option-container']
                                }
                                title={t('CTX_DOWNLOAD_VIDEO')}
                                onClick={copyDownloadLink}
                            >
                                <Icon
                                    className={styles['menu-icon']}
                                    name={'download'}
                                />

                                <div
                                    className={
                                        styles['context-menu-option-label']
                                    }
                                >
                                    {t('CTX_COPY_VIDEO_DOWNLOAD_LINK')}
                                </div>
                            </Button>
                    }
                </div>
            );
        },
        [
            description,
            isTorrent,
            streamLink,
            copyStreamLink,
            magnetLink,
            copyMagnetLink,
            downloadLink,
            copyDownloadLink,
        ]
    );

    React.useEffect(() => {
        if (!routeFocused) {
            closeMenu();
        }
    }, [
        routeFocused,
        closeMenu,
    ]);

    return (
        <Popup
            className={className}
            onMouseUp={popupLabelOnMouseUp}
            onLongPress={popupLabelOnLongPress}
            onContextMenu={popupLabelOnContextMenu}
            open={menuOpen}
            onCloseRequest={closeMenu}
            renderLabel={renderLabel}
            renderMenu={renderMenu}
        />
    );
};

Stream.Placeholder = StreamPlaceholder;

Stream.propTypes = {
    className: PropTypes.string,
    videoId: PropTypes.string,
    videoReleased: PropTypes.instanceOf(Date),
    addonName: PropTypes.string,
    name: PropTypes.string,
    description: PropTypes.string,
    thumbnail: PropTypes.string,
    progress: PropTypes.number,
    deepLinks: PropTypes.shape({
        player: PropTypes.string,
        externalPlayer: PropTypes.shape({
            download: PropTypes.string,
            magnet: PropTypes.string,
            streaming: PropTypes.string,
            playlist: PropTypes.string,
            fileName: PropTypes.string,
            web: PropTypes.string,
            openPlayer: PropTypes.shape({
                ios: PropTypes.string,
                android: PropTypes.string,
                windows: PropTypes.string,
                macos: PropTypes.string,
                linux: PropTypes.string,
            }),
        }),
    }),
    onClick: PropTypes.func,
};

module.exports = Stream;
