const crypto = require("crypto");
const url = require("url");
const config = require("../config");
const IncomingMessage = require("http").IncomingMessage;

const securityKey = config.security && config.security.key ? config.security.key : null;
const algorithm = config.security && config.security.algo ? config.security.algo : "sha1";
const algorithmLength = securityKey ? getSignature("").toString("hex").length : 40;

const channelPattern = new RegExp(
	"^([a-f0-9]{32})(?:\\:([a-f0-9]{32}))?(?:\\.([a-f0-9]{" + algorithmLength + "}))?$"
);

/**
 *
 * @param {Buffer|String} value
 * @returns {Buffer|String}
 */
function getSignature(value)
{
	const hmac = crypto.createHmac(algorithm, securityKey);
	hmac.update(Buffer.isBuffer(value) ? value.toString("hex") : value);
	return hmac.digest();
}

class Channel
{
	/**
	 *
	 * @param {Buffer} privateId
	 * @param {?Buffer} publicId
	 */
	constructor(privateId, publicId)
	{
		/**
		 *
		 * @type {Buffer}
		 */
		this.privateId = privateId;

		/**
		 *
		 * @type {?Buffer}
		 */
		this.publicId = Buffer.isBuffer(publicId) ? publicId : null;

		/**
		 *
		 * @type {?String}
		 */
		this.hexPrivateId = null;
		this.hexPublicId = null;
	}

	getPrivateId()
	{
		return this.privateId;
	}

	getHexPrivateId()
	{
		if (this.hexPrivateId === null)
		{
			this.hexPrivateId = this.privateId.toString("hex");
		}

		return this.hexPrivateId;
	}

	getPublicId()
	{
		return this.publicId;
	}

	getHexPublicId()
	{
		if (this.hexPublicId === null)
		{
			this.hexPublicId = this.publicId.toString("hex");
		}

		return this.hexPublicId;
	}

	/**
	 *
	 * @param {IncomingMessage|String} query
	 * @param {Boolean} [skipSign=false]
	 * @returns Channel[]
	 */
	static getChannels(query, skipSign)
	{
		const channels = [];

		if (query instanceof IncomingMessage)
		{
			const uri = url.parse(query.url, true);
			query = uri.query.CHANNEL_ID;
		}

		if (!query || query.length < 1)
		{
			return [];
		}

		const channelParts = query.split("/");
		for (let i = 0; i < channelParts.length; i++)
		{
			let result = Channel.parse(channelParts[i], skipSign);
			if (!result)
			{
				return [];
			}

			const [privateId, publicId] = result;

			channels.push(
				new Channel(
					Buffer.from(privateId, "hex"),
					publicId ? Buffer.from(publicId, "hex") : null
				)
			);
		}

		return channels;
	}

	static isValid(id)
	{
		return Buffer.isBuffer(id) && id.length === 16;
	}

	/**
	 *
	 * @param {Buffer} privateId
	 * @param {Buffer} signature
	 * @return {boolean}
	 */
	static isSignatureValid(privateId, signature)
	{
		return getSignature(privateId).equals(signature);
	}

	/**
	 *
	 * @param {Buffer} publicId
	 * @param {Buffer} signature
	 * @return {boolean}
	 */
	static isPublicSignatureValid(publicId, signature)
	{
		return Channel.getPublicSignature(publicId).equals(signature);
	}

	static getSignature(value)
	{
		return getSignature(value);
	}

	static getPublicSignature(value)
	{
		return getSignature(
			Buffer.isBuffer(value)
				? "public:" + value.toString("hex")
				: "public:" + value
		);
	}

	/**
	 *
	 * @param channel
	 * @param skipSign
	 * @returns Boolean|Array
	 */
	static parse(channel, skipSign)
	{
		const match = typeof(channel) === "string" && channel.match(channelPattern);
		if (!match)
		{
			return false;
		}

		const [, privateChannelId, publicChannelId, signature] = match;

		if (publicChannelId)
		{
			if (
				!securityKey ||
				!signature ||
				getSignature(privateChannelId + ":" + publicChannelId).toString("hex") !== signature
			)
			{
				return false;
			}
		}
		else if (
			securityKey &&
			skipSign !== true &&
			(!signature || getSignature(privateChannelId).toString("hex") !== signature)
		)
		{
			return false;
		}

		return [privateChannelId, publicChannelId];
	}
}

module.exports = Channel;