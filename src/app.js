const CONFIG = require('./../config.js');
const twitter = require('twitter');
const parser = require('rss-parser');
const feedParser = new parser();
const fetchUrl = require('fetch').fetchUrl;
const moment = require('moment');

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

const GLOBAL_FEED_CONFIGS = new Map();
GLOBAL_FEED_CONFIGS.set(getDefaultPollInterval(), []);

const broadcastTo = (t, opts, client) => {
        let config = getConfig();
        switch(t) {
        case 'twitter': {
                let status = opts.status;
                if (opts.boost) {
                        status = `BT: ${status}`;
                }
                if (status.length > config.twitter.max_tweet_length) {
                        status = status.substring(0, config.twitter.max_tweet_length);
                }
                client.post('statuses/update', {
                        status: `${status} ${opts.mastodonRef}`
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
                if (feedItem.link.endsWith('/activity')) {
                        fetchUrl(feedItem.link, (activityError, activityMeta, activity) => {
                                const json = JSON.parse(activity.toString('utf-8'));
                                broadcastTo('twitter', {
                                        boost: true,
                                        status: feedItem.contentSnippet,
                                        mastodonRef: json.object,
                                }, clients.twitter);
                        });
                } else {
                        broadcastTo('twitter', {
                                status: feedItem.contentSnippet,
                                mastodonRef: feedItem.link,
                        }, clients.twitter);
                }
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
                        }, pollInterval);
                }).catch((feedError) => {
                        Log(feedError);
                        setTimeout(() => {
                                pollFeed(pollInterval, feedConfig);
                        }, pollInterval);
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

