const path = require("path");
const argv = require("minimist")(process.argv.slice(2));

/**
 * @typedef {object} AppConfig
 * @property {ServerConfig[]} servers
 * @property {boolean} [publishMode]
 * @property {boolean} [clusterMode]
 * @property {string} [processUniqueId]
 * @property {StorageConfig} [storage]
 * @property {DebugConfig} [debug]
 * @property {SecurityConfig} [security]
 * @property {LimitConfig} [limits]
 */

/**
 * @typedef {object} ServerConfig
 * @property {string} name
 * @property {number} port
 * @property {string} hostname
 * @property {number} [backlog]
 * @property {number} [maxPayload]

 * @property {object} [routes]
 * @property {string} [routes.pub]
 * @property {string} [routes.sub]
 * @property {string} [routes.rest]
 * @property {string} [routes.stat]
 * @property {object} [ssl]
 * @property {string} [ssl.key]
 * @property {string} [ssl.cert]
 * @property {string} [ssl.ciphers]
 * @property {string} [ssl.dhparam]
 * @property {boolean} [ssl.honorCipherOrder]
 */

/**
 * @typedef {object} SecurityConfig
 * @property {string} key
 * @property {string} [algo=sha1]
 */

/**
 * @typedef {object} DebugConfig
 * @property {string[]} [ip]
 * @property {boolean} [trustProxy]
 */

/**
 * @typedef {object} StorageConfig
 * @property {string} [type=redis]
 * @property {number} [messageTTL=86400]
 * @property {number} [channelTTL=86400]
 * @property {number} [onlineTTL=120]
 * @property {number} [onlineDelta=10]
 */

/**
 * @typedef {object} LimitConfig
 * @property {number} [maxPayload=1048576]
 * @property {number} [maxConnPerChannel=100]
 * @property {number} [maxMessagesPerRequest=100]
 * @property {number} [maxChannelsPerRequest=100]
 */

/** @type {AppConfig} */
let config = {};

if (argv.config && argv.config.length > 1)
{
	if (!argv.config.match(/\.json/))
	{
		console.log("Error: config file must have .json extension.");
		process.exit();
	}

	config = require(path.resolve(argv.config));
}
else
{
	config = require("./config.json");
}

if (!config.processUniqueId)
{
	config.processUniqueId = require("os").hostname() + "-" + process.pid;
}

config.clusterMode =
	config.clusterMode === true ||
	config.publishMode === true ||
	require("cluster").isWorker
;

function mergeSettings(original, assignments)
{
	const keys = Object.keys(assignments);

	if (keys.length > 0)
	{
		keys.forEach(function(key) {
			if (assignments[key] instanceof Object && !Array.isArray(assignments[key]))
			{
				if (!original[key])
				{
					original[key] = {};
				}

				original[key] = mergeSettings(original[key], assignments[key]);
			}
			else
			{
				original[key] = assignments[key];
			}
		});
	}

	return original;
}

const defaultConfig = {
	"storage": {
		"messageTTL": 86400,
		"channelTTL": 86400,
		"onlineTTL": 120,
		"onlineDelta": 10
	},

	"limits": {
		"maxPayload": 1048576,
		"maxConnPerChannel": 100,
		"maxMessagesPerRequest": 100,
		"maxChannelsPerRequest": 100
	},

	"debug": {
		"folderName": path.resolve(__dirname, "../logs")
	}
};

/** @type {AppConfig} */
module.exports = mergeSettings(defaultConfig, config);