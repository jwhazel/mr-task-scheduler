const fs = require('fs');
const { execFile } = require('child_process');
const watch = require('node-watch');
const schedule = require('node-schedule');
var tasks = [];

const config = {
    todoFile: "./todo/tasks.json",
    logOutput: "./logs/output.json",
    mtsLogFile: "./logs/log.txt",
    logOutputMaxEntries: 100
}

//Start reading our initial task list
readTaskList();

//Watch the taskList folder for any changes
watch(config.todoFile, function (evt, name) {
    //if (name === 'taskList/manifest.json') {
    readTaskList();
    //}
});


/**
 * Reads task list, discard if not valid json
 */
function readTaskList() {
    try {
        let taskList = JSON.parse(fs.readFileSync(config.todoFile));
        _log('Successfully ingested new task list');
        updateTasks(taskList);
    }
    catch (err) {
        _log('ERROR: Invalid task list file');
        if (tasks.length === 0) {
            _log('ERROR: Unable to find tasks, terminating');
            process.exit();
        }
        else {
            _log('Reverting to last known good task list');
        }
    }
}


/**
 * Update our primary job list overwriting anything that was in there previously
 * @param {object} taskList the raw list of jobs
 */
function updateTasks(taskList) {
    //Cancel any existing scheduled jobs
    for (var i = 0, f = tasks.length; i < f; i++) {
        tasks[i].__schedule.cancel();
    }

    //Create a new list of jobs
    tasks = taskList;
    tasks.forEach((task) => {
        task.__schedule = schedule.scheduleJob(task.interval, () => {
            runTask(task);
        });
    });
}


/**
 * Function to execute when the job interval fires
 * @param {object} job object containing everything about the job
 */
function runTask(task) {
    //break the task into executable + args as need be for execFile()
    let args = task.exec.split(" ");
    let executable = args[0];
    args.shift();

    //capture task start time to measure performance
    let startTime = process.hrtime();

    //execute the task passing task meta data and start time into the callback
    (function (task, startTime) {
        execFile(executable, args, (err, stdout, stderr) => {
            let endTime = process.hrtime(startTime);
            let elapsedTime = Math.round(endTime[0] * 1000 + endTime[1] / 1000000);
            let message = "";

            if (err) {
                message = err;
            }
            else if (stderr) {
                message = stderr;
            }
            else {
                message = stdout;
            }

            //Log the output
            _logOutput({
                task: task.name,
                success: err || stderr ? false : true,
                timestamp: new Date(),
                executionTime: elapsedTime,
                message: JSON.stringify(message).replace(/[{}]/g, "")
            });

            //check to see whether to call success or error handler
            if ((err || stderr) && task.onFail !== "") {
                executeHandler(task.onFail);
            }
            else if (task.onSuccess !== "") {
                executeHandler(task.onSuccess);
            }
        });
    })(task, startTime);
}


function executeHandler(handler){
    let args = handler.split(" ");
    let executable = args[0];
    args.shift();

    execFile(executable, args, (err, stdout, stderr) => {});
};



/**
 * Log program output to console and text file
 * @param {string} txt string describing what happened
 */
function _log(txt) {
    txt = new Date() + ' - ' + txt;
    console.log(txt);

    fs.appendFile(config.mtsLogFile, txt + '\n', (err) => { });
}


/**
 * Log results from job execution
 * @param {object} job object containing everything about the job
 */
function _logOutput(obj) {
    fs.readFile(config.logOutput, 'utf8', (err, data) => {
        var logFile = JSON.parse(data);
        logFile.unshift(obj);

        //Keep the logfile at max entries
        if (logFile.length > config.logOutputMaxEntries) {
            logFile.pop();
        }

        fs.writeFile(config.logOutput, JSON.stringify(logFile, null, 2), (err) => { });
    });
}