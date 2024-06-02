const mocha = require("mocha");
const config = require("../../config");
const path = require("path");
const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");

const logger = new winston.Logger({
	transports: [
		new DailyRotateFile({
			name: "test-error-log",
			level: "error",
			maxsize: 1024 * 1024 * 10,
			filename: path.join(config.debug.folderName, "/test-error"),
			datePattern: ".yyyy-MM-dd.log",
			showLevel: false,
			json: false
		})
	],
	levels: {
		error: 0
	}
});

function NagiosReporter(runner)
{
	mocha.reporters.Base.call(this, runner);

	let passes = 0;
	let failures = 0;
	const failedTests = [];

	runner.on("pass", function(test){
		passes++;
	});

	runner.on("fail", (test, error) => {
		failures++;
		failedTests.push({test, error});
	});

	runner.on("start", () => {
		logger.error("Test execution started.");
	});

	runner.on("end", () => {

		if (failures > 0)
		{
			if (passes > 0)
			{
				console.log("Some tests failed (%d) |", failures);

				failedTests.forEach(record => {
					console.log(record.test.fullTitle());
					logger.error(record.test.fullTitle(), ":", record.error.message);
				});

				process.exit(1);
			}
			else
			{
				console.log("All the tests failed.");
				process.exit(2);
			}
		}
		else
		{
			console.log("All the tests passed successfully (%d/%d).", passes, passes + failures);
			process.exit(0);
		}

		logger.error("Test execution complete.");
	});
}

module.exports = NagiosReporter;