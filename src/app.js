const CONFIG = require('./../config.js');
const twitter = require('twitter');
const parser = require('rss-parser');
const feedParser = new parser();
const fetchUrl = require('fetch').fetchUrl;
const moment = require('moment');
const h2p = require('html2plaintext');

const getConfig = () => {
        return CONFIG;
};

const getDefaultPollInterval = () => {
        return getConfig().mastodon.pollInterval;
};

const Log = (...logs) => {
        const datetime = [moment().format('YYYY-MM-DD HH:mm:ss\t')];
        const args = [].concat(datetime, logs);
        console.log.apply(console, args);
};

const shortenText = (text, maxLength, appendDots) => {
        let shortened = text.substr(0, maxLength);
        shortened = shortened.substr(0, Math.min(shortened.length, shortened.lastIndexOf(' ')));
        if (appendDots)
                shortened = shortened + ' ...';
        return shortened;
};

const GLOBAL_FEED_CONFIGS = new Map();
GLOBAL_FEED_CONFIGS.set(getDefaultPollInterval(), []);

const broadcastTo = (t, opts, client) => {
        let config = getConfig();
        let attachTootLink = false;
        switch(t) {
        case 'twitter': {
                let message = opts.message;
                let tootLink = '';
                if (typeof opts.mastodonRef === 'object' &&
                        'object' in opts.mastodonRef &&
                        typeof opts.mastodonRef.object === 'object' &&
                        'id' in opts.mastodonRef.object) {
                        tootLink = opts.mastodonRef.object.id;
                } else if (typeof opts.mastodonRef === 'object' && typeof opts.mastodonRef.object === 'string') {
                        tootLink = opts.mastodonRef.object;
                }
                if (opts.isReply) {
                        message = `Reply to ${opts.replyUrl}: ${message}`;
                        tootLink = opts.mastodonRef.object.id;
                        attachTootLink = true;
                }
                if (opts.isBoost) {
                        message = `BT: ${message}`;
                        tootLink = opts.mastodonRef.object;
                        attachTootLink = true;
                }
                if (message.length > config.twitter.max_tweet_length) {
                        message = shortenText(message, config.twitter.max_tweet_length, true);
                        attachTootLink = true;
                }
                if (attachTootLink === true) {
                        message = message + ' ' + tootLink;
                }
                client.post('statuses/update', {
                        status: message,
                }).catch((error) => {
                        Log(error);
                });
                break;
        }
        default:
                break;
        }
};


const forEachFeedItemCallback = (feedItem, feedConfig, clients) => {
        const lastPoll = feedConfig.lastPoll;
        const feedItemPubDate = feedItem.pubDate;
        const feedItemPubUnixtime = moment(feedItemPubDate).unix();
        if (feedItemPubUnixtime > lastPoll) {
                feedConfig.lastPoll = feedItemPubUnixtime;
                const activityUrl = (feedItem.link.endsWith('/activity')) ? feedItem.link : feedItem.link + '/activity';
                fetchUrl(activityUrl, (activityError, activityMeta, activity) => {
                        const json = JSON.parse(activity.toString('utf-8'));
                        const isReply = (json.object && json.object.inReplyTo) ? true : false;
                        const replyUrl =(isReply) ? json.object.inReplyTo : null;
                        const isBoost = (json.type === 'Announce') ? true : false;
                        const carbonCopy = (isBoost) ? json.cc : null;
                        broadcastTo('twitter', {
                                isReply: isReply,
                                replyUrl: replyUrl,
                                isBoost: isBoost,
                                carbonCopy: carbonCopy,
                                message: h2p(feedItem.content),
                                mastodonRef: json,
                        }, clients.twitter);
                });
        }
};

const onFeedCallback = (feed, feedConfig) =>  {
        const config = getConfig();
        const twitterConfig = Object.assign(config.twitter, feedConfig.twitter);
        const twitterClient = new twitter(twitterConfig);
        const items = feed.items.reverse();
        items.forEach((feedItem) => {
                forEachFeedItemCallback(feedItem, feedConfig, {
                        twitter: twitterClient
                });
        });
};

const pollFeed = (pollInterval, feedConfig) => {
        feedParser.parseURL(feedConfig.url)
                .then((feed) => {
                        onFeedCallback(feed, feedConfig);
                        setTimeout(() => {
                                pollFeed(pollInterval, feedConfig);
                        }, pollInterval*1000);
                }).catch((feedError) => {
                        Log(feedError);
                        setTimeout(() => {
                                pollFeed(pollInterval, feedConfig);
                        }, pollInterval*1000);
                });
};

const pollFeeds = (feedConfigs, pollInterval) => {
        feedConfigs.forEach((feedConfig) => {
                pollFeed(pollInterval, feedConfig);
        });
};

const getFeedsByPollInterval = (pollInterval) => {
        if (GLOBAL_FEED_CONFIGS.get(pollInterval)) {
                return GLOBAL_FEED_CONFIGS.get(pollInterval);
        } else {
                GLOBAL_FEED_CONFIGS.set(pollInterval, []);
                return GLOBAL_FEED_CONFIGS.get(pollInterval);
        }
};

const getAllFeeds = () => GLOBAL_FEED_CONFIGS;

const forEachFeedConfigCallback = (feedConfig) => {
        let customPollInterval = getDefaultPollInterval();
        if (feedConfig.pollInterval) {
                customPollInterval = feedConfig.pollInterval;
        }
        if (feedConfig.url) {
                feedConfig.lastPoll = moment().unix();
                getFeedsByPollInterval(customPollInterval).push(feedConfig);
        }
};



const boot = () => {
        const config = getConfig();
        config.mastodon.feeds.forEach(forEachFeedConfigCallback);
        getAllFeeds().forEach(pollFeeds);
};

boot();

Log('Mastodon Broadcaster successfully started');

