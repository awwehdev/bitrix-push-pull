const { EventEmitter } = require("events");
const WebSocket = require("ws");
const { RequestBatch, Request, ResponseBatch } = require("../../lib/models");
const Channel = require("../../lib/channel");
const crypto = require("crypto");
const argv = require("minimist")(process.argv.slice(2));

const subUrl = argv.subUrl || "http://localhost:1337/sub/";

class Client extends EventEmitter
{
	constructor(id, options)
	{
		super();

		options = options || {};

		this.responses = new Set();

		this.id = id;
		this.privateId = crypto.createHash("md5").update(this.id.toString()).digest("hex");
		this.publicId = crypto.createHash("md5").update(this.privateId).digest("hex");

		this.serverUrl = options.serverUrl ? options.serverUrl : subUrl;
		this.binaryMode = options.binaryMode !== false;

		this.channelId = this.privateId + (this.publicId ? ":" + this.publicId : "");
		this.signature = Channel.getSignature(this.channelId).toString("hex");

		this.url =
			this.serverUrl +
			"?CHANNEL_ID=" + this.channelId + "." + this.signature +
			"&binaryMode=" + this.binaryMode
		;
	}

	connect(params)
	{
		this.websocket = new WebSocket(
			this.url + (params ? "&" + params : ""),
			{ rejectUnauthorized: false }
		);

		if (this.binaryMode)
		{
			this.websocket.binaryType = "arraybuffer";
		}

		this.websocket.on("open", this.handleOpen.bind(this));
		this.websocket.on("close", this.handleClose.bind(this));
		this.websocket.on("error", this.handleError.bind(this));
		this.websocket.on("message", this.handleMessage.bind(this));
	}

	disconnect()
	{
		this.websocket.close(1000);
	}

	/**
	 *
	 * @param {Request} request
	 */
	send(request)
	{
		const batch = new RequestBatch();
		batch.requests.push(request);

		this.websocket.send(
			RequestBatch.encode(batch).finish(),
			() => {} //to avoid a possible exception
		);
	}

	getWebsocket()
	{
		return this.websocket;
	}

	getChannelId()
	{
		return this.channelId;
	}

	getSignature()
	{
		return this.signature;
	}

	getPublicId()
	{
		return this.publicId;
	}

	getHexPublicId()
	{
		return Buffer.from(this.publicId, "hex");
	}

	getPrivateId()
	{
		return this.privateId;
	}

	getHexPrivateId()
	{
		return Buffer.from(this.privateId, "hex");
	}

	handleOpen()
	{
		this.emit("connection");
	}

	handleClose(code, reason)
	{
		this.emit("close", code, reason);
	}

	handleError(code, description)
	{
		this.emit("error", code, description);
	}

	handleMessage(buffer, flags)
	{
		const responseBatch = ResponseBatch.decode(new Uint8Array(buffer));
		responseBatch.responses.forEach((response) => {
			this.responses.add(response);
			if (response.outgoingMessages)
			{
				response.outgoingMessages.messages.forEach((message) => {
					this.emit("message", message);
				})
			}
			else if (response.channelStats)
			{
				this.emit("message", response.channelStats.channels);
			}
		});

		this.emit("response", responseBatch.responses);
	}
}

module.exports = Client;