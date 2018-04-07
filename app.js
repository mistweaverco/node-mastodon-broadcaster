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


const forEachFeedItemCallback = (item, feedUrl) => {
        const lastActionDate = lastActionDates[feedUrl];
        const feedItemPubDate = item.pubDate;
        const feedItemPubUnixtime = moment(feedItemPubDate).unix();
        if (feedItemPubUnixtime > lastActionDate) {
                lastActionDates[feedUrl] = feedItemPubUnixtime;
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
                forEachFeedItemCallback(item, feedUrl);
        });
};

const forEachFeedUrlCallback = (feedConfig) => {
        let feedUrl;
        let pollInterval = config.mastodon.pollInterval;
        if (typeof feedConfig === 'string') {
                feedUrl = feedConfig;
        } else {
                pollInterval = (feedConfig.pollInterval) ? feedConfig.pollInterval*1000 : pollInterval;
                feedUrl = feedConfig.url;
        }
        feedParser.parseURL(feedUrl)
                .then((item) => {
                        onFeedCallback(item, feedUrl);
                        setTimeout(pollFeeds, pollInterval);
                }).catch((feedError) => {
                        console.log(feedError);
                        setTimeout(pollFeeds, pollInterval);
                });
};

config.mastodon.feeds.forEach(feedConfig => lastActionDates[feedConfig] = moment().unix());

const pollFeeds = () => {
        config.mastodon.feeds.forEach(forEachFeedUrlCallback);
};

pollFeeds();

