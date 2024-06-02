"use strict";

const { Request, RequestBatch, ResponseBatch, IncomingMessage, Receiver, ChannelId } = require("../../lib/models");
const Client = require("./client");
const Chat = require("./chat");
const Channel = require("../../lib/channel");
const config = require("../../config");
const argv = require("minimist")(process.argv.slice(2));

const assert = require("assert");
const request = require("request");

const subUrl = argv.subUrl || "http://localhost:1337/sub/";
const pubUrl = argv.pubUrl || "http://localhost:1337/pub/";
const restUrl = argv.restUrl || "http://localhost:1337/rest/";
const statsUrl = argv.statsUrl || "http://localhost:1337/server-stat/";

describe("Message Exchange", function() {

	describe("Websocket", function() {

		let chat = null;
		let client = null;

		beforeEach(function(done) {
			chat = new Chat(5);
			chat.connect();
			chat.once("connection", done);
		});

		afterEach(function() {
			chat.disconnect();
			chat = null;

			if (client)
			{
				client.disconnect();
			}
		});

		it("sends one-to-one messages", function(done) {
			chat.setMaxMessages(5 * 5);
			chat.getClients().forEach((sender, index) => {
				chat.getClients().forEach((receiver) => {
					const request = createMessageRequest(createMessage(index + 1, receiver.getPublicId()));
					sender.send(request);
				});
			});

			chat.once("ready", () => {
				verifyChatResult(chat, "12345");
				done();

			});
		});

		it("sends one-to-one messages (delayed)", function(done) {
			chat.setMaxMessages(5 * 5);
			chat.getClients().forEach((sender, index) => {
				chat.getClients().forEach((receiver) => {

					const request = createMessageRequest(createMessage(index + 1, receiver.getPublicId()));
					setTimeout(() => {
						sender.send(request);
					}, index * 200);

				});
			});

			chat.once("ready", () => {
				verifyChatResult(chat, "12345");
				done();

			});
		});

		it("sends one message with many public channels", function(done) {
			chat.setMaxMessages(5);
			const channels = chat.getClients().map(client => client.getPublicId());
			chat.getClients()[0].send(createMessageRequest(createMessage("12345", channels)));

			chat.once("ready", () => {
				verifyChatResult(chat, "12345");
				done();

			});
		});

		it("sends one request with all messages", function(done) {

			chat.setMaxMessages(5 * 5);
			chat.getClients().forEach((sender, index) => {

				const messages = [];

				chat.getClients().forEach((receiver) => {
					messages.push(createMessage(index + 1, receiver.getPublicId()))
				});

				sender.send(createMessageRequest(messages));
			});

			chat.once("ready", () => {
				verifyChatResult(chat, "12345");
				done();

			});
		});

	});

	describe("POST /pub/", function() {

		let chat = null;

		beforeEach(function(done) {
			chat = new Chat(15);
			chat.connect();
			chat.once("connection", done);
		});

		afterEach(function() {
			chat.disconnect();
			chat = null;
		});

		it("sends one-to-one messages (plain text)", function(done) {
			chat.setMaxMessages(15 * 15);
			chat.getClients().forEach((sender, index) => {
				chat.getClients().forEach((receiver) => {
					request({
						method: "POST",
						uri: pubUrl + "?CHANNEL_ID=" + receiver.getPrivateId(),
						body: (index + 1).toString()
					});
				});
			});

			chat.once("ready", () => {
				verifyChatResult(chat, "123456789101112131415");
				done();

			});
		});

		it("sends one message to many channels (plain text)", function(done) {
			chat.setMaxMessages(15);

			const channels = chat.getClients().map(client => client.getPrivateId());
			request({
				method: "POST",
				uri: pubUrl + "?CHANNEL_ID=" + channels.join("/"),
				body: "message"
			});

			chat.once("ready", () => {
				verifyChatResult(chat, "message");
				done();
			});
		});

		it("sends one-to-one messages (binary)", function(done) {
			chat.setMaxMessages(15 * 15);
			chat.getClients().forEach((sender, index) => {
				chat.getClients().forEach((receiver) => {

					const batch = createBatch(
						createMessageRequest(createMessage(index + 1, receiver.getPublicId()))
					);

					setTimeout(() => {
						request({
							method: "POST",
							uri:
							pubUrl + "?CHANNEL_ID=" + sender.getPrivateId() + "&binaryMode=true",
							body: RequestBatch.encode(batch).finish()
						});
					}, index * 100);

				});
			});

			chat.once("ready", () => {
				verifyChatResult(chat, "123456789101112131415");
				done();

			});
		});

		it("sends one message to many channels (binary)", function(done) {
			chat.setMaxMessages(15);

			const channels = chat.getClients().map(client => client.getPrivateId());
			const batch = createBatch(createMessageRequest(createMessage("message", null, channels)));

			request({
				method: "POST",
				uri: pubUrl + "?binaryMode=true",
				body: RequestBatch.encode(batch).finish()
			});

			chat.once("ready", () => {
				verifyChatResult(chat, "message");
				done();
			});
		});
	});

	describe("REST", function() {

		let chat = null;

		beforeEach(function(done) {
			chat = new Chat(9);
			chat.connect();
			chat.once("connection", done);
		});

		afterEach(function() {
			chat.disconnect();
			chat = null;
		});

		it("sends one-to-one messages", function(done) {

			chat.setMaxMessages(9 * 9);
			chat.getClients().forEach((sender, senderIndex) => {
				chat.getClients().forEach((receiver, receiverIndex) => {

					const batch = createBatch(
						createMessageRequest(createMessage(senderIndex + 1, receiver.getPublicId()))
					);

					setTimeout(() => {
						request({
							method: "POST",
							uri:
							restUrl + "?CHANNEL_ID=" + sender.getChannelId() + "." + sender.getSignature(),
							body: RequestBatch.encode(batch).finish()
						});
					}, senderIndex * 100);

				});
			});

			chat.once("ready", () => {
				verifyChatResult(chat, "123456789");
				done();

			});

		});

		it("sends one message to many channels (binary)", function(done) {
			chat.setMaxMessages(9);

			const channels = chat.getClients().map(client => client.getPublicId());
			const batch = createBatch(createMessageRequest(createMessage("rest message", channels)));

			const sender = chat.getClients()[0];

			request({
				method: "POST",
				uri: restUrl + "?CHANNEL_ID=" + sender.getChannelId() + "." + sender.getSignature(),
				body: RequestBatch.encode(batch).finish()
			});

			chat.once("ready", () => {
				verifyChatResult(chat, "rest message");
				done();
			});
		});
	});
});

describe("Channel Stats", function() {

	let chat = null;
	let client = null;

	beforeEach(function(done) {
		chat = new Chat(5);
		chat.connect();
		chat.once("connection", done);
	});

	afterEach(function() {
		chat.disconnect();
	});

	describe("Websocket", function() {

		it("gets online public channel stats", function(done) {
			chat.setMaxMessages(5);
			const publicIds = chat.getClients().map(client => client.getHexPublicId());
			const client = new Client(200);

			chat.getClients().forEach(client => {
				client.send(createChannelStatsRequest(
					publicIds
				));
			});

			chat.once("ready", () => {
				chat.getClients().forEach(client => {
					client.responses.forEach(repsonse => {
						const ids = [];
						repsonse.channelStats.channels.forEach(channelStat => {
							ids.push(channelStat.id)
							assert.ok(channelStat.isPrivate === false);
							assert.ok(channelStat.isOnline);
						});
						assert.deepEqual(ids, publicIds);
					})
				});
				done();
			});
		});

		it("gets online and offline public channels", function(done) {
			chat.setMaxMessages(5);

			const onlinePublicIds = chat.getClients().map(client => client.getHexPublicId());
			const onlinePrivateIds = chat.getClients().map(client => client.getHexPrivateId());

			const offlineChat = new Chat(5, 100);
			const offlinePublicIds = offlineChat.getClients().map(client => client.getHexPublicId());
			const offlinePrivateIds = offlineChat.getClients().map(client => client.getHexPrivateId());

			const publicIds = onlinePublicIds.concat(offlinePublicIds);
			const privateIds = onlinePrivateIds.concat(offlinePrivateIds);

			chat.getClients().forEach(client => {
				client.send(createChannelStatsRequest(
					publicIds
				));
			});

			chat.once("ready", () => {
				chat.getClients().forEach(client => {
					client.responses.forEach(repsonse => {
						const online = [];
						const offline = [];
						repsonse.channelStats.channels.forEach(channelStat => {
							channelStat.isOnline ? online.push(channelStat.id) : offline.push(channelStat.id);
							assert.ok(channelStat.isPrivate === false);
						});
						assert.deepEqual(online, onlinePublicIds);
						assert.deepEqual(offline, offlinePublicIds);
					})
				});
				done();
			});
		});

	});

	describe("POST /pub/ (binary)", function() {
		it("gets channel stats (private/public, online/offline)", function(done) {

			const onlinePublicIds = chat.getClients().map(client => client.getHexPublicId());
			const onlinePrivateIds = chat.getClients().map(client => client.getHexPrivateId());

			const offlineChat = new Chat(5, 100);
			const offlinePublicIds = offlineChat.getClients().map(client => client.getHexPublicId());
			const offlinePrivateIds = offlineChat.getClients().map(client => client.getHexPrivateId());

			const publicIds = onlinePublicIds.concat(offlinePublicIds);
			const privateIds = onlinePrivateIds.concat(offlinePrivateIds);

			const requestIds = privateIds.concat(publicIds);

			const body = RequestBatch.encode(createBatch(createChannelStatsRequest(publicIds, privateIds))).finish();
			request.post(
				pubUrl + "?binaryMode=true",
				{
					body,
					encoding: null //If null, the body is returned as a Buffer
				},
				function(error, response, body) {

					assert.equal(error, null);
					assert.equal(response.statusCode, 200);

					const responseBatch = ResponseBatch.decode(new Uint8Array(body));
					const channels = responseBatch.responses[0].channelStats.channels;

					const result = {
						ids: [],
						onlinePublicIds: [],
						onlinePrivateIds: [],
						offlinePublicIds: [],
						offlinePrivateIds: []
					};

					channels.forEach(channel => {
						result.ids.push(channel.id);

						if (channel.isPrivate)
						{
							channel.isOnline
								? result.onlinePrivateIds.push(channel.id)
								: result.offlinePrivateIds.push(channel.id)
							;
						}
						else
						{
							channel.isOnline
								? result.onlinePublicIds.push(channel.id)
								: result.offlinePublicIds.push(channel.id)
							;
						}
					});

					assert.deepEqual(result.ids, requestIds);
					assert.deepEqual(result.onlinePublicIds, onlinePublicIds);
					assert.deepEqual(result.onlinePrivateIds, onlinePrivateIds);
					assert.deepEqual(result.offlinePublicIds, offlinePublicIds);
					assert.deepEqual(result.offlinePrivateIds, offlinePrivateIds);

					done();
				}
			);
		});
	});

	describe("GET /pub/ (plain text)", function() {

		it("gets private channel stats", function(done) {

			const privateIds = chat.getClients().map(client => client.getPrivateId());
			const offlineClient = new Client(100);

			const url =
				pubUrl + "?CHANNEL_ID=" + privateIds.join("/")
				//+ "/" + offlineClient.getPrivateId() //push-server skips offline channels
				//+ "/" + chat.getClients()[0].getPublicId() //push-server skips public channels
			;
			request.get(url, function(error, response, body) {
				assert.ok(error === null);

				const result = JSON.parse(body);
				const ids = result.infos.map(channelStat => channelStat.channel);

				assert.deepEqual(ids, privateIds);
				done();
			});
		});
	});

	describe("REST", function() {
		it("gets public channel stats", function(done) {
			const publicIds = chat.getClients().map(client => client.getHexPublicId());
			const batch = createBatch(createChannelStatsRequest(publicIds));
			const client = chat.getClients()[0];

			request.post(
				restUrl + "?CHANNEL_ID=" + client.getChannelId() + "." + client.getSignature(),
				{
					body: RequestBatch.encode(batch).finish(),
					encoding: null //If null, the body is returned as a Buffer
				},
				function(error, response, body) {
					assert.ok(error === null);

					const responseBatch = ResponseBatch.decode(new Uint8Array(body));
					const ids = [];
					responseBatch.responses[0].channelStats.channels.forEach(channelStat => {
						ids.push(channelStat.id)
						assert.ok(channelStat.isPrivate === false);
						assert.ok(channelStat.isOnline);
					});

					assert.deepEqual(ids, publicIds);

					done();
				}
			);
		});
	});
});

describe("Server Stats", function() {

	it("gets stats via GET /server-stat/", function(done) {
		request.get(statsUrl, (error, response, body) => {
			assert.equal(error, null);
			assert.equal(response.statusCode, 200);
			verifyServerStats(JSON.parse(body));
			done();
		});
	});

	it("gets stats via POST /pub/ (binary)", function(done) {
		const body = RequestBatch.encode(createBatch(createServerStatsRequest())).finish();
		request.post(
			pubUrl + "?binaryMode=true",
			{
				body,
				encoding: null //If null, the body is returned as a Buffer
			},
			function(error, response, body) {

				assert.equal(error, null);
				assert.equal(response.statusCode, 200);

				const responseBatch = ResponseBatch.decode(new Uint8Array(body));
				const stats = JSON.parse(responseBatch.responses[0].serverStats.json);
				verifyServerStats(stats);

				done();
			}
		);
	});

	it("gets stats via Websocket (not allowed)", function(done) {
		const client = new Client(1);
		client.connect();

		client.once("connection", () => {
			client.send(createServerStatsRequest());
		});

		client.once("close", (code, reason) => {
			assert.equal(code, 4014);
			assert.equal(reason, "4014: Request command is not allowed.");
			client.disconnect();
			done();
		});
	});

	it("gets stats via REST (not allowed)", function(done) {
		const client = new Client(10);
		const body = RequestBatch.encode(createBatch(createServerStatsRequest())).finish();
		request.post(
			restUrl + "?CHANNEL_ID=" + client.getChannelId() + "." + client.getSignature(),
			{ body },
			function(error, response, body) {
				assert.equal(error, null);
				assert.equal(body, "4014: Request command is not allowed.");
				assert.equal(response.statusCode, 400);
				done();
			}
		);
	});

});

describe("Long Polling Emulation", function() {

	[
		{ binaryRequest: true, binaryResponse: true },
		{ binaryRequest: false, binaryResponse: false },
		{ binaryRequest: true, binaryResponse: false },
		{ binaryRequest: false, binaryResponse: true }
	].forEach(({binaryRequest, binaryResponse}, index) => {

		const requestType = binaryRequest ? "binary" : "text";
		const responseType = binaryResponse ? "binary" : "text";

		it(`sends ${requestType} requests, gets ${responseType} responses` , function(done) {
			this.timeout(6000);

			const client = new Client(600 + index);
			const url =
				subUrl + "?CHANNEL_ID=" + client.getChannelId() + "." + client.getSignature() +
				(binaryResponse ? "&binaryMode=true" : "");

			const expected = "1234567890";
			let result = "";
			let lastMessageId = null;

			function connect()
			{
				request.get(
					url + (lastMessageId ? "&mid=" + lastMessageId : ""),
					{ encoding: null },
					function(error, response, body) {

						assert.equal(error, null);
						assert.equal(response.statusCode, 200);

						let messages = [];
						if (binaryResponse)
						{
							const responseBatch = ResponseBatch.decode(new Uint8Array(body));
							responseBatch.responses.forEach(response => {
								messages = messages.concat(response.outgoingMessages.messages);
							});
						}
						else
						{
							messages = getMessagesFromText(body.toString());
						}

						let finished = false;
						messages.forEach(message => {
							lastMessageId = binaryResponse ? Buffer.from(message.id).toString("hex") : message.mid;
							const messageBody = binaryResponse ? message.body : message.text.toString();

							result += messageBody;

							if (messageBody === expected[expected.length - 1])
							{
								finished = true;
							}
						});

						if (finished)
						{
							assert.equal(result, expected);
							done();
						}
						else
						{
							setTimeout(() => connect(), 50);
						}
					}
				);
			}

			connect();

			let timeout = 0;
			expected.split("").forEach((body, index) => {

				timeout += 200;

				setTimeout(() => {

					if (binaryRequest)
					{
						const batch = createBatch(
							createMessageRequest(createMessage(body, null, client.getPrivateId()))
						);

						body = RequestBatch.encode(batch).finish();
					}

					request.post(
						pubUrl + (binaryRequest ? "?binaryMode=true" : "?CHANNEL_ID=" + client.getPrivateId()),
						{
							body,
							headers: {
								"message-expiry": 3600 * 24,
								"x-forwarded-for": "92.50.195.150"
							}
						},
						(error, response, body) => {
							assert.equal(error, null);
							assert.equal(response.statusCode, 200);
						}
					);
				}, timeout);
			});
		});

	});
});

describe("Data Validation", function() {

	let limits = {};
	let serverStats = {};

	before(function(done) {

		const body = RequestBatch.encode(createBatch(createServerStatsRequest())).finish();
		request.post(
			pubUrl + "?binaryMode=true",
			{
				body,
				encoding: null //If null, the body is returned as a Buffer
			},
			(error, response, body) => {

				assert.equal(error, null);
				assert.equal(response.statusCode, 200);

				const responseBatch = ResponseBatch.decode(new Uint8Array(body));
				const stats = JSON.parse(responseBatch.responses[0].serverStats.json);
				serverStats = stats[0];
				limits = stats[0].limits;

				done();
			}
		);

	});

	it("sends wrong binary data", function(done) {

		const client = new Client(1000);
		client.connect();

		client.once("connection", () => {
			client.getWebsocket().send(Buffer.from([1,2,3,4,5]));
		});

		client.once("close", (code, reason) => {
			assert.equal(code, 4013);
			assert.equal(reason, "4013: Wrong Request Data.");
			client.disconnect();
			done();
		});
	});

	it("sends a message more than 1MB (websocket)", function(done) {

		const client = new Client(1000);
		client.connect();

		client.once("connection", () => {
			client.send(createMessageRequest(
				createMessage("1".repeat(config.limits.maxPayload), client.getPublicId())
			));
		});

		let disconnected = false;
		client.once("error", (code, description) => {
			if (!disconnected)
			{
				done();
				client.disconnect();
			}

			disconnected = true;
		});

		client.on("message", message => {
			assert.ok(false, "Message was received.");
		});

		client.once("close", (code, reason) => {
			if (!disconnected)
			{
				done();
				client.disconnect();
			}

			disconnected = true;
		});
	});

	it("sends a message more than 1MB (rest)", function(done) {

		const client = new Client(500);

		const batch = createBatch(
			createMessageRequest(createMessage("1".repeat(config.limits.maxPayload), client.getPublicId()))
		);

		request.post(
			restUrl + "?CHANNEL_ID=" + client.getChannelId() + "." + client.getSignature(),
			{
				body: RequestBatch.encode(batch).finish(),
				encoding: null //If null, the body is returned as a Buffer
			},
			function(error, response, body) {

				assert.equal(error, null);
				assert.equal(response.statusCode, 413);

				done();
			}
		);
	});

	it("sends a REST request without a signature", function(done) {

		const client = new Client(500);

		const batch = createBatch(
			createMessageRequest(createMessage("test", client.getPublicId()))
		);

		request.post(
			restUrl + "?CHANNEL_ID=" + client.getChannelId(),
			{
				body: RequestBatch.encode(batch).finish()
			},
			function(error, response, body) {

				assert.equal(error, null);
				assert.equal(response.statusCode, 400);
				assert.equal(body, "4012: Public Channel Id is Required.");

				done();
			}
		);
	});

	it("sends a REST request without a public channel", function(done) {

		const client = new Client(500);

		const batch = createBatch(
			createMessageRequest(createMessage("test", client.getPublicId()))
		);

		request.post(
			restUrl + "?CHANNEL_ID=" +
			client.getPrivateId() + "." + Channel.getSignature(client.getPrivateId()).toString("hex"),
			{
				body: RequestBatch.encode(batch).finish()
			},
			function(error, response, body) {

				assert.equal(error, null);
				assert.equal(response.statusCode, 400);
				assert.equal(body, "4012: Public Channel Id is Required.");

				done();
			}
		);
	});

	it("tries to subscribe a lot of clients to one channel", function(done) {

		if (serverStats.clusterMode === true)
		{
			done();
			return;
		}

		let overhead = 3;
		const maxConnPerChannel = limits.maxConnPerChannel;
		const clientCount = maxConnPerChannel + overhead;
		const clients = [];
		let closedConns = 0;

		let isTestDone = false;

		for (let i = 1; i <= clientCount; i++)
		{
			const client = new Client(50);

			const timeout = i <= overhead ? (i-1) * 50 : overhead * 70;

			setTimeout(() => {
				client.connect();
			}, timeout);

			clients.push(client);

			client.on("close", (code, reason) => {

				if (isTestDone)
				{
					return;
				}

				assert.ok(i <= overhead);
				assert.equal(reason, "4029: Too many connections");
				assert.equal(code, 4029);

				closedConns++;

				if (overhead === closedConns)
				{
					isTestDone = true;
					done();
					clients.forEach(client => client.disconnect());
				}
			});
		}
	});

	it("sends a lot of messages in one request", function(done) {

		const client = new Client(789);
		client.connect();

		client.once("connection", () => {

			const messages = [];
			for (let i = 0; i <= limits.maxMessagesPerRequest; i++)
			{
				messages.push(createMessage(i, client.getPublicId()));
			}

			client.send(createMessageRequest(messages));
		});

		client.once("close", (code, reason) => {
			assert.equal(code, 4016);
			assert.equal(reason, "4016: Request exceeded the maximum number of messages.");
			client.disconnect();
			done();
		});
	});

	it("sends an empty channel stats request (WS)", function(done) {

		const client = new Client(444);
		client.connect();
		client.on("connection", () => {
			client.send(createChannelStatsRequest([]));
		});

		client.on("close", (code, reason) => {
			assert.equal(code, 4017);
			assert.equal(reason, "4017: No channels found.");
			client.disconnect();
			done();
		});

	});

	it("sends an empty channel stats request (HTTP)", function(done) {
		request.get(pubUrl + "?CHANNEL_ID=", (error, response, body) => {
			assert.equal(error, null);
			assert.equal(response.statusCode, 400);
			assert.equal(body, "4017: No channels found.");
			done();
		});
	});

	it("sends a stats request with a lot of channels (WS)", function(done) {

		const client = new Client(444);
		client.connect();

		client.on("connection", () => {

			const publicIds = [];

			for (var i = 0; i <= config.limits.maxChannelsPerRequest; i++)
			{
				const client = new Client(i);
				publicIds.push(client.getPublicId());
			}

			client.send(createChannelStatsRequest(publicIds));
		});

		client.on("close", (code, reason) => {
			assert.equal(code, 4018);
			assert.equal(reason, "4018: Request exceeded the maximum number of channels.");
			client.disconnect();
			done();
		});

	});

	it("sends a stats request with a lot of channels (HTTP)", function(done) {

		const publicIds = [];

		for (var i = 0; i <= config.limits.maxChannelsPerRequest; i++)
		{
			const client = new Client(i);
			publicIds.push(client.getPublicId());
		}

		request.get(pubUrl + "?CHANNEL_ID=" + publicIds.join("/"), (error, response, body) => {
			assert.equal(error, null);
			assert.equal(response.statusCode, 400);
			assert.equal(body, "4018: Request exceeded the maximum number of channels.");
			done();
		});

	});

	it("gets stats for a private channel (REST)", function(done) {

		const client = new Client(1);
		const body = RequestBatch.encode(
			createBatch(createChannelStatsRequest(null, client.getPrivateId()))
		).finish();

		request({
			method: "POST",
			uri: restUrl + "?CHANNEL_ID=" + client.getChannelId() + "." + client.getSignature(),
			body
		}, (error, response, body) => {
			assert.equal(error, null);
			assert.equal(response.statusCode, 400);
			assert.equal(body, "4020: Private channel is not allowed.");
			done();
		});
	});

	it("gets stats for a wrong private channel (trusted)", function(done) {

		const client = new Client(1);
		const statsRequest = createChannelStatsRequest(client.getPublicId());
		statsRequest.channelStats.channels[0].id = Buffer.from("wrong id");
		const body = RequestBatch.encode(createBatch(statsRequest)).finish();

		request({
			method: "POST",
			uri: pubUrl + "?binaryMode=true",
			body
		}, (error, response, body) => {
			assert.equal(error, null);
			assert.equal(response.statusCode, 400);
			assert.equal(body, "4019: Request has an invalid channel id.");
			done();
		});
	});

	it("sends stats request with a wrong signature (REST)", function(done) {

		const client = new Client(1);
		const statsRequest = createChannelStatsRequest(client.getPublicId());
		statsRequest.channelStats.channels[0].signature = Buffer.from("wrong id");
		const body = RequestBatch.encode(createBatch(statsRequest)).finish();

		request({
			method: "POST",
			uri: restUrl + "?CHANNEL_ID=" + client.getChannelId() + "." + client.getSignature(),
			body
		}, (error, response, body) => {
			assert.equal(error, null);
			assert.equal(response.statusCode, 400);
			assert.equal(body, "4021: Channel has an invalid signature.");
			done();
		});
	});

	it("sends a message with an empty signature to the public channel", function(done) {
		const client = new Client(2);
		client.connect();

		client.once("connection", function() {
			const message = createMessage("message", client.getPublicId());
			delete message.receivers[0].signature;

			client.send(createMessageRequest([message]));
		});

		client.on("close", (code, reason) => {
			assert.equal(code, 4021);
			assert.equal(reason, "4021: Channel has an invalid signature.");
			client.disconnect();
			done();
		});

		client.on("message", message => {
			assert.ok(false);
		});

	});

	it("sends a message with empty receivers", function(done) {
		const client = new Client(2);
		client.connect();

		client.once("connection", function() {
			const message = createMessage("message", client.getPublicId());
			message.receivers = [];
			client.send(createMessageRequest([message]));
		});

		client.on("close", (code, reason) => {
			assert.equal(code, 4017);
			assert.equal(reason, "4017: No channels found.");
			client.disconnect();
			done();
		});

		client.on("message", message => {
			assert.ok(false);
		});

	});

	it("sends a message with a wrong signature to the public channel", function(done) {
		const client = new Client(2);
		client.connect();

		client.once("connection", function() {
			const message = createMessage("message", client.getPublicId());

			message.receivers[0].signature = Channel.getPublicSignature("wrong id");

			client.send(createMessageRequest([message]));
		});

		client.on("close", (code, reason) => {
			assert.equal(code, 4021);
			assert.equal(reason, "4021: Channel has an invalid signature.");
			client.disconnect();
			done();
		});

		client.on("message", message => {
			assert.ok(false);
		});

	});

	it("sends a message to the private channel", function(done) {
		const client = new Client(2);
		client.connect();

		client.once("connection", function() {
			const message = createMessage("message", null, client.getPrivateId());
			client.send(createMessageRequest([message]));
		});

		client.on("close", (code, reason) => {
			assert.equal(code, 4020);
			assert.equal(reason, "4020: Private channel is not allowed.");
			client.disconnect();
			done();
		});

		client.on("message", message => {
			assert.ok(false);
		});

	});

	it("sends a message with a wrong private channel", function(done) {

		const client = new Client(2);

		const batch = createBatch(
			createMessageRequest(createMessage("message", null, "wrong id"))
		);

		request.post(
			pubUrl + "?binaryMode=true",
			{
				body: RequestBatch.encode(batch).finish(),
				encoding: null //If null, the body is returned as a Buffer
			},
			function(error, response, body) {

				assert.equal(error, null);
				assert.equal(response.statusCode, 400);
				assert.equal(body, "4019: Request has an invalid channel id.");

				done();
			}
		);

	});

	it("tries to listen to a public channel", function(done) {

		const client = new Client(1);
		request.get(
			subUrl +
			"?CHANNEL_ID=" + client.getPublicId() + "." +
			Channel.getPublicSignature(client.getPublicId()).toString("hex") +
			"&binaryMode=true",
			function(error, response, body) {
				assert.equal(error, null);
				assert.equal(response.statusCode, 400);
				assert.equal(body, "4010: Wrong Channel Id.");
				done();
			}
		);

	});

});

describe("Last Messages", function() {

	let client = null;
	let firstMessageId = null;
	let lastMessageId = null;

	beforeEach(function(done) {

		client = new Client(123);
		client.connect();

		client.once("connection", () => {

			["A", "B", "C", "D", "E", "F"].forEach((body, index) => {

				const toPrivateChannel = index % 2 === 0;

				setTimeout(() => {

					const batch = createBatch(createMessageRequest(
						createMessage(
							body,
							toPrivateChannel ? null : client.getPublicId(),
							toPrivateChannel ? client.getPrivateId() : null,
							120)
						)
					);

					request({
						method: "POST",
						uri: pubUrl + "?binaryMode=true",
						body: RequestBatch.encode(batch).finish()
					});
				}, index * 200);

			});

		});

		client.on("message", message => {

			if (message.body === "A")
			{
				firstMessageId = Buffer.from(message.id).toString("hex");
			}

			if (message.body === "F")
			{
				lastMessageId = Buffer.from(message.id).toString("hex");
				client.disconnect();
				done();
			}
		});

	});

	afterEach(function() {
		firstMessageId = null;
		lastMessageId = null;
	});

	describe("Websocket", function() {
		it("gets last messages", function(done) {

			const client = new Client(123);
			client.connect("mid=" + firstMessageId);
			client.once("response", responses => {

				let result = "";
				responses.forEach(response => {
					response.outgoingMessages.messages.forEach((message) => {
						result += message.body;
					})
				});

				client.disconnect();

				assert.equal(result, "BCDEF");
				done();
			});


		});
	});

	describe("Long Polling", function() {

		it("gets last messages", function(done) {

			let url = subUrl + "?CHANNEL_ID=" + client.getChannelId() + "." + client.getSignature();
			url += "&binaryMode=true&mid=" + firstMessageId;

			request.get(url, { encoding: null }, function(error, response, body) {

				assert.equal(error, null);
				assert.equal(response.statusCode, 200);

				const responseBatch = ResponseBatch.decode(new Uint8Array(body));

				let result = "";
				responseBatch.responses.forEach(response => {
					response.outgoingMessages.messages.forEach((message) => {
						result += message.body;
					})
				});

				assert.equal(result, "BCDEF");

				done();
			});
		});

		it("gets last message on timeout", function(done) {

			this.timeout(41000);
			let url = subUrl + "?CHANNEL_ID=" + client.getChannelId() + "." + client.getSignature() + "&binaryMode=true";

			request.get(url, { encoding: null }, function(error, response, body) {

				assert.equal(error, null);
				assert.equal(response.statusCode, 304);
				assert.equal(body, "");
				assert.equal(response.headers["last-message-id"], lastMessageId);

				done();
			});
		});

	});
});

/**
 *
 * @param {string} body
 * @param {string|string[]} [publicId]
 * @param {string|string[]} [privateId]
 * @param {number} [expiry=60]
 * @return {IncomingMessage}
 */
function createMessage(body, publicId, privateId, expiry)
{
	const receivers = [];
	const pubChannels = Array.isArray(publicId) ? publicId : (publicId ? [publicId] : []);
	const channels = Array.isArray(privateId) ? privateId : (privateId ? [privateId] : []);

	channels.forEach(channel => {
		receivers.push(new Receiver({
			isPrivate: true,
			id: Buffer.from(channel, "hex")
		}));
	})
	pubChannels.forEach(channel => {
		receivers.push(new Receiver({
			isPrivate: false,
			id: Buffer.from(channel, "hex"),
			signature: Channel.getPublicSignature(channel)
		}));
	})

	return IncomingMessage.create({
		receivers,
		body: body.toString(),
		expiry: expiry || 60,
		type: "unit_test"
	});
}

/**
 *
 * @param {IncomingMessage|IncomingMessage[]} messages
 * @return {Request}
 */
function createMessageRequest(messages)
{
	return Request.create({
		incomingMessages: {
			messages: Array.isArray(messages) ? messages : [messages]
		}
	});
}

/**
 *
 * @param {Request} request
 * @return {RequestBatch}
 */
function createBatch(request)
{
	const batch = new RequestBatch();
	batch.requests.push(request);

	return batch;
}

/**
 *
 * @param {Chat} chat
 * @param {string} result
 */
function verifyChatResult(chat, expected)
{
	chat.getClients().forEach((client) => {

		const messages = [];
		client.responses.forEach((response) => {
			response.outgoingMessages.messages.forEach((message) => {
					messages.push(message);
				})
		});

		let result = "";
		messages.sort((a, b) => a.body - b.body).forEach(message => {
			result += message.body;
		})

		assert.equal(result, expected, "Wrong result");
	});
}

function createChannelStatsRequest(publicId, privateId)
{
	const channels = [];
	const publicIds = Array.isArray(publicId) ? publicId : (publicId ? [publicId] : []);
	const privateIds = Array.isArray(privateId) ? privateId : (privateId ? [privateId] : []);

	privateIds.forEach(channel => {
		channels.push(new ChannelId({
			isPrivate: true,
			id: Buffer.isBuffer(channel) ? channel : Buffer.from(channel, "hex")
		}));
	})
	publicIds.forEach(channel => {
		channels.push(new ChannelId({
			isPrivate: false,
			id: Buffer.isBuffer(channel) ? channel : Buffer.from(channel, "hex"),
			signature: Channel.getPublicSignature(channel)
		}));
	})

	return Request.create({
		channelStats: {
			channels
		}
	});
}

function createServerStatsRequest()
{
	return Request.create({
		serverStats: {}
	});
}

function verifyServerStats(serverStats)
{
	serverStats.forEach(processStats => {
		assert.ok(
			"pid" in processStats && "date" in processStats
		);
	});
}

function getMessagesFromText(text)
{
	if (typeof(text) !== "string" || text.length < 1)
	{
		return [];
	}

	var parts = text.match(/#!NGINXNMS!#(.*?)#!NGINXNME!#/gm);
	if (parts === null)
	{
		return [];
	}

	const messages = [];
	for (var i = 0; i < parts.length; i++)
	{
		const message = (new Function("return " + parts[i].substring(12, parts[i].length - 12)))();
		messages.push(message);
	}

	return messages;
}