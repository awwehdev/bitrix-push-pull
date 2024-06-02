const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const config = require("../../config");
const util = require("util");
const path = require("path");

let allowedIPs = false;
let trustProxy = false;

if (config.debug)
{
	if (Array.isArray(config.debug.ip))
	{
		allowedIPs = config.debug.ip;
	}

	trustProxy = config.debug.trustProxy === true;
}

const infoLogger = new winston.Logger({
	transports: [
		new winston.transports.Console({
			name: "console",
			level: "info",
			showLevel: false,
			timestamp: timestamp,
			formatter: formatter
		}),
		new winston.transports.File({
			name: "info-log",
			level: "info",
			maxsize: 1024 * 1024 * 10,
			filename: path.join(config.debug.folderName, "/info.log"),
			showLevel: false,
			json: false,
			silent: false,
			colorize: true,
			timestamp: timestamp,
			formatter: formatter
		})
	],
	levels: {
		info: 0
	},
	colors: {
		info: "green"
	}
});

const debugLogger = new winston.Logger({
	transports: [
		new DailyRotateFile({
			name: "debug-log",
			level: "debug",
			maxsize: 1024 * 1024 * 10,
			filename: path.join(config.debug.folderName, "/debug"),
			datePattern: ".yyyy-MM-dd.log",
			showLevel: false,
			json: false,
			timestamp: timestamp,
			formatter: formatter
		})
	],
	levels: {
		debug: 0
	},
	colors: {
		debug: "blue"
	}
});

const errorLogger = new winston.Logger({
	transports: [
		new DailyRotateFile({
			name: "error-log",
			level: "error",
			maxsize: 1024 * 1024 * 10,
			filename: path.join(config.debug.folderName, "/error"),
			datePattern: ".yyyy-MM-dd.log",
			showLevel: false,
			json: false,
			handleExceptions: true,
			timestamp: timestamp,
			formatter: formatter
		}),
		new winston.transports.Console({
			name: "error-console",
			level: "error",
			showLevel: false,
			timestamp: timestamp,
			formatter: formatter,
			handleExceptions: true,
			colorize: true,
			prettyPrint: true,
			humanReadableUnhandledException: true
		})
	],
	levels: {
		error: 0
	},
	colors: {
		error: "red"
	}
});

const systemErrorLogger = new winston.Logger({
	transports: [
		new DailyRotateFile({
			name: "system-error-log",
			level: "error",
			maxsize: 1024 * 1024 * 10,
			filename: path.join(config.debug.folderName, "/system-error"),
			datePattern: ".yyyy-MM-dd.log",
			showLevel: false,
			json: false,
			handleExceptions: true,
			timestamp: timestamp,
			formatter: formatter
		}),
		new winston.transports.Console({
			name: "system-error-console",
			level: "error",
			showLevel: false,
			timestamp: timestamp,
			formatter: formatter,
			handleExceptions: true,
			colorize: true,
			prettyPrint: true,
			humanReadableUnhandledException: true
		})
	],
	levels: {
		error: 0
	},
	colors: {
		error: "red"
	}
});

const logger = {

	info: function(...args)
	{
		infoLogger.info(...args);
	},

	debug: function(...args)
	{
		debugLogger.debug(...args);
	},

	error: function(...args)
	{
		errorLogger.error(...args);
	},

	systemError: function(...args)
	{
		systemErrorLogger.error(...args);
	},

	initSocket: function(socket)
	{
		socket.bxDebugStart = new Date();
	},

	initTLSSocket: function(tlsSocket)
	{
		if (!tlsSocket || !tlsSocket._parent || !tlsSocket._parent.bxDebugStart)
		{
			return;
		}

		tlsSocket.bxDebugStart = tlsSocket._parent.bxDebugStart;
		tlsSocket.bxDebugStartTLS = new Date();
	},

	/**
	 *
	 * @param request
	 * @param response
	 */
	debugHttpRequest: function(request, response)
	{
		if (!request || !request.socket || !request.socket.bxDebugStart)
		{
			return;
		}

		const socket = request.socket;
		const forwarded = request.headers["x-forwarded-for"];
		const ipAddress = trustProxy && forwarded ? forwarded : socket.remoteAddress;

		if (allowedIPs === false || !isValidIp(ipAddress, allowedIPs))
		{
			return;
		}

		const startTime = socket.bxDebugStart;
		const id = getUniqueId();
		socket.bxDebugId = id;
		socket.bxIpAddress = ipAddress;

		debugLogger.debug(id, "[TCP-CONNECTION]", formatDate(startTime), ipAddress);
		if (socket.bxDebugStartTLS)
		{
			debugLogger.debug(id, "[TLS-CONNECTION]", formatDate(socket.bxDebugStartTLS), ipAddress);
		}

		debugLogger.debug(id, "[" + request.method + (request.upgrade ? "-UPGRADE" : "") + "]", request.url, ipAddress);

		request.on("close", function() {
			debugLogger.debug(id, "[CLOSED-BY-CLIENT]", (Date.now() - startTime) + "ms", ipAddress);
		});

		if (response)
		{
			response.on("close", function() {
				debugLogger.debug(id, "[CLOSED]", (Date.now() - startTime) + "ms", this.statusCode, ipAddress);
			});

			response.on("finish", function() {
				debugLogger.debug(id, "[FINISHED]", (Date.now() - startTime) + "ms", this.statusCode, ipAddress);
			});
		}
	},

	debugWebsocket: function(request, socket)
	{
		if (!request || !request.socket || !request.socket.bxDebugId)
		{
			return;
		}

		const id = request.socket.bxDebugId;
		const startTime = request.socket.bxDebugStart;

		debugLogger.debug(id, "[WS-CONNECTION]", request.url, request.socket.bxIpAddress);

		socket.on("close", (code, message) => {
			debugLogger.debug(
				id,
				"[WS-CLOSED]",
				code,
				message,
				(Date.now() - startTime) + "ms",
				request.socket.bxIpAddress
			);
		});
	},

	profileStart: function(connection)
	{
		if (!connection.isDebugMode())
		{
			return null;
		}

		return new Date().getTime();
	},

	profileEnd: function(connection, startDate, ...args)
	{
		if (startDate === null || !connection.isDebugMode())
		{
			return;
		}

		args.unshift(connection.getSocket().bxDebugId);
		args.push((new Date().getTime() - startDate) + "ms", connection.getSocket().bxIpAddress);

		debugLogger.debug(...args);
	}
};

module.exports = logger;

function isValidIp(ip, allowed)
{
	if (!util.isString(ip))
	{
		return false;
	}

	for (let i = 0, len = allowed.length; i < len; i++)
	{
		if (ip.indexOf(allowed[i]) !== -1)
		{
			return true;
		}
	}

	return false;
}

function timestamp()
{
	return formatDate(new Date());
}

function formatter(options)
{
	return options.timestamp() + " " + (options.message !== undefined ? options.message : "") +
		(options.meta && Object.keys(options.meta).length ? " "+ JSON.stringify(options.meta) : "");
}

function padding(number)
{
	if (number < 10)
	{
		return "0" + number;
	}

	return number;
}

function formatDate(date)
{
	return date.getUTCFullYear() +
		"-" + padding(date.getUTCMonth() + 1) +
		"-" + padding(date.getUTCDate()) +
		" " + padding(date.getUTCHours()) +
		":" + padding(date.getUTCMinutes()) +
		":" + padding(date.getUTCSeconds()) +
		"." + (date.getUTCMilliseconds() / 1000).toFixed(3).slice(2, 5);
}

let requestId = 0;
function getUniqueId()
{
	return process.pid + "T" + (++requestId).toString().padStart(8, "0");
}