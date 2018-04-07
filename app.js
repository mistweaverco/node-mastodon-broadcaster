const config = require('./config.js');
const twitter = require('twitter');
const twitterClient = new twitter(config.twitter);
const parser = require('rss-parser');
const feedParser = new parser();
const fetchUrl = require('fetch').fetchUrl;
const moment = require('moment');

let lastActionDates = [];

const xPost = (t, opts) => {
        switch(t) {
        case 'twitter': {
                let status = opts.status;
                if (opts.boost) {
                        status = `BT: ${status}`;
                }
                if (status.length > config.twitter.max_tweet_length) {
                        status = status.substring(0, config.twitter.max_tweet_length);
                }
                twitterClient.post('statuses/update', {
                        status: `${status} ${opts.mastodonRef}`
                }).catch((error) => {
                        console.log(error);
                });
                break;
        }
        default:
                break;
        }
};


const forEachFeedItemCallback = (item, lastActionDate) => {
        const feedItemPubDate = item.pubDate;
        const feedItemPubUnixtime = moment(feedItemPubDate).unix();
        if (feedItemPubUnixtime > lastActionDate) {
                lastActionDate = feedItemPubUnixtime;
                if (item.link.endsWith('/activity')) {
                        fetchUrl(item.link, (activityError, activityMeta, activity) => {
                                const json = JSON.parse(activity.toString('utf-8'));
                                xPost('twitter', {
                                        boost: true,
                                        status: item.contentSnippet,
                                        mastodonRef: json.object,
                                });
                        });
                } else {
                        xPost('twitter', {
                                status: item.contentSnippet,
                                mastodonRef: item.link,
                        });
                }
        }
};

const onFeedCallback = (feed, feedUrl) =>  {
        let items = feed.items.reverse();
        items.forEach((item) => {
                forEachFeedItemCallback(item, lastActionDates[feedUrl]);
        });
};

const forEachFeedUrlCallback = (feedConfig) => {
        let feedUrl;
        let pullInterval = config.mastodon.pullInterval;
        if (typeof feedConfig === 'string') {
                feedUrl = feedConfig;
        } else {
                pullInterval = (feedConfig.pullInterval) ? feedConfig.pullInterval*1000 : pullInterval;
                feedUrl = feedConfig.url;
        }
        feedParser.parseURL(feedUrl)
                .then((item) => {
                        onFeedCallback(item, feedUrl);
                }).catch((feedError) => {
                        console.log(feedError);
                }).finally(() => {
                        setTimeout(pullFeeds, pullInterval);
                });
};

config.mastodon.feeds.forEach(feedConfig => lastActionDates[feedConfig] = moment().unix());

const pullFeeds = () => {
        config.mastodon.feeds.forEach(forEachFeedUrlCallback);
};

pullFeeds();

