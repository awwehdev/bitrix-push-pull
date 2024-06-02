const Router = require("./router");
const logger = require("../lib/debug");
const HttpRequest = require("../lib/transports/httprequest");
const { ChannelId, IncomingMessage, SenderType } = require("../lib/models");
const config = require("../config");

class Routing
{
	/**
	 *
	 * @param {Application} application
	 * @param {ServerConfig} serverConfig
	 */
	constructor(application, serverConfig)
	{
		this.router = new Router();
		this.application = application;
		this.maxPayload = config.limits.maxPayload;

		const routes = serverConfig.routes || {};

		if (routes.pub)
		{
			this.router.post(routes.pub, this.processPublishRequest.bind(this));
			this.router.get(routes.pub, this.processChannelStatsRequest.bind(this));
		}

		//Long Polling
		if (routes.sub)
		{
			this.router.get(routes.sub, (request, response) => {
				application.subscribe(request, response);
			});

			this.router.options(routes.sub, (request, response) => {
				response.writeHead(200, {
					"Content-Type": "text/plain",
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
					"Access-Control-Allow-Headers": "If-Modified-Since, If-None-Match"
				});
				response.end();
			});
		}

		//Brand New Command System
		if (routes.rest)
		{
			this.router.post(routes.rest, this.processRestRequest.bind(this));
		}

		//Server Stats
		if (routes.stat)
		{
			this.router.get(routes.stat, (request, response) => {
				const connection = new HttpRequest(request, response, this.getApplication());
				application.getServerStats(connection);

				this.getApplication().getStatistics().incrementRequest("serverStats");
			});
		}
	}

	/**
	 *
	 * @return {Application}
	 */
	getApplication()
	{
		return this.application;
	}

	processPublishRequest(request, response)
	{
		const connection = new HttpRequest(request, response, this.getApplication(), true);
		if (connection.isBinaryMode())
		{
			Routing.processBody(request, response, this.maxPayload, requestBody => {
				this.getApplication().processClientRequest(requestBody, connection, true);
			});
		}
		else
		{
			let expiry = request.headers["message-expiry"] && parseInt(request.headers["message-expiry"], 10);
			expiry = (expiry && !isNaN(expiry) && expiry > 0) ? expiry : 0;

			Routing.processBody(request, response, this.maxPayload, requestBody => {

				connection.close(200);

				if (!requestBody || requestBody.length < 1)
				{
					return;
				}

				const incomingMessage = IncomingMessage.create({
					receivers: connection.getReceivers(),
					sender: {
						type: SenderType.BACKEND
					},
					body: requestBody.toString(),
					expiry
				});

				this.getApplication().publish(incomingMessage, connection);
			});
		}
	}

	processChannelStatsRequest(request, response)
	{
		const connection = new HttpRequest(request, response, this.getApplication(), true);

		const channels = [];
		connection.getChannels().forEach(channel => {
			channels.push(new ChannelId({
				id: channel.getPrivateId(),
				isPrivate: true
			}));
		});

		this.getApplication().getStatistics().incrementRequest("channelStats");

		this.getApplication().getChannelStats(channels, connection, true);
	}

	processRestRequest(request, response)
	{
		const connection = new HttpRequest(request, response, this.getApplication());
		connection.setBinaryMode(true);

		Routing.processBody(request, response, this.maxPayload, requestBody => {
			this.getApplication().processClientRequest(requestBody, connection, false);
		});
	}

	processRequest(request, response)
	{
		logger.debugHttpRequest(request, response);
		const route = this.router.process(request, response);
		if (!route)
		{
			response.writeHead(404, {
				"Content-Type": "text/plain",
				"Access-Control-Allow-Origin": "*"
			});
			response.end();
		}
	}

	static processBody(request, response, maxPayload, callback)
	{
		let queryData = [];
		let bytes = 0;
		request.on("data", (data) => {

			bytes += data.length;
			queryData.push(data);

			if (bytes > maxPayload)
			{
				queryData = [];
				response.writeHead(413, {
					"Content-Type": "text/plain",
					"Access-Control-Allow-Origin": "*"
				});
				response.end();
				request.connection.destroy();

				logger.error("HTTP Request: Max payload size exceeded.");
			}
		});

		request.on("end", () => {
			callback(Buffer.concat(queryData));
		});
	}
}

module.exports = Routing;
