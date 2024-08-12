//Imports
const { header } = require('express/lib/request');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const puppeteer = require('puppeteer');
const { google, domains_v1alpha2 } = require('googleapis');
const mysql = require('mysql');
const util = require('util');
const myAPIcalls = require(__dirname + '/APIcalls'); 
const mySegmentCreation = require(__dirname + '/segmentFunctions'); 
const pdfwriting = require(__dirname + '/PDFwriting'); 
const databaseFuncs = require(__dirname + '/databaseFuncs'); 
const mainScriptCall = require(__dirname + '/finalProjectMain'); 
//Imports



//Database Basic Info
    const connection = mysql.createConnection({
        host: 'mysql.addns.co.uk',
        port: 3306,
        user: 'example-user', //redacted for public-purposes
        password: 'example-password', //redacted for public-purposes
        database: 'example-database' //redacted for public-purposes
    });
    const query = util.promisify(connection.query).bind(connection);
//Database Basic Info



//Test functions
    async function calcHeightAndUpdate(){
        const starting_height = 792 - await pdfwriting.getMarginTop() - await pdfwriting.getMarginBottom(); //gets whatever the margins are set to //752
        let page_number = 2 //Starts at 2 as we have the cover page on page 1
        let current_height_left = starting_height;

        const segmentQuery = `SELECT segment_id FROM Segment WHERE chosen = 1`;
        const segmentResults = await databaseFuncs.queryAsync(segmentQuery);

        for (const segment of segmentResults) { //for each chosen segment
            let segment_id = segment.segment_id //make it easier to call
            let segment_height = await databaseFuncs.getSegmentHeightByID(segment_id) //Get the height of the segment
            current_height_left -= segment_height

            if (current_height_left < 1){
                page_number += 1
                current_height_left = starting_height //reset back to full height as we are on a new page
                current_height_left -= segment_height //Take off the height this segment will use up
                await databaseFuncs.setSegmentPageNumberByID(segment_id, page_number)
            }

            else if (current_height_left > 1 && segment_height < starting_height){
                await databaseFuncs.setSegmentPageNumberByID(segment_id, page_number)
            }

            else if (segment_height > starting_height){
                page_number += 1 //Make sure it is on its own page
                console.error(`We have an issue, a segment (id: ${segment_id}) is taking up more room than a whole page. Spill over will occur.`);
                await databaseFuncs.setSegmentPageNumberByID(segment_id, page_number)
                page_number += 1 //Give it space after so it doesnt effect the layout of other pages
            }

            else{
                console.error(`This message should be impossible to show, segment id: ${segment_id}.`);
            }
        }
    }

    async function readJsonAndExtractValuesSync(filePath) {
        const fullPath = path.join(__dirname, filePath);
        try {
            const data = fs.readFileSync(fullPath, 'utf8');
            const jsonData = JSON.parse(data);
    
            for (const item of jsonData) {
                const clientID = item.clientID;
                const reportName = item.report_name;
                const reportWebsite = item.report_website;
    
                // Printing the variables
                console.error(`Fetching website ${reportWebsite}'s and updating the report table`);
                console.log(`   Client ID: ${clientID}, Report Name: ${reportName}, Report Website: ${reportWebsite}\n`);
    
                await databaseFuncs.setReportInfoByID(1, clientID, reportName, reportWebsite);
    
                await main();
            }

        } catch (error) {
            console.error('Error occurred:', error);
        }
    }
//Test functions



//PIPE LINE
async function main(){
    // (0) reset DB IF NEEDED
        //await databaseFuncs.reset_database();

    // (1) Front-end popualtes wanted segments only (chosen 1 or 0)\\
        //Do this MANUALLY at the moment as no front end to use toggles. All 1 at the moment
        // This is where front end allows the user to add their summary segment (custom information)

    // (2) Gets all the data from google
       //await mainScriptCall.processReports();

    // (3) Calculates how much space all the segments will take up
        await mainScriptCall.calcSpaceForAllSegments(); 

    // (4a) Waiting for front end to popualte 'position' & 'page_number' value in table (block re-arrangement front end)\\
    // (4b) Or, if you want less white space, comment out the command below and edit the position and page number in the database manually\\
        await calcHeightAndUpdate();

    // (5) Generate the Final Report\\
        await mainScriptCall.generateFinalReport().then(() => console.error("\nFinal Report Generation Complete. Don't open until all reports have finished generating\n---------------------------------------------------------------------------------------\n"));
}



async function generateReports(){
    console.log("\nDo NOT open any PDF's until they have all generated.")
    console.log("Do NOT remove 'spaceCalc.pdf' in the file structure.\n")
    await readJsonAndExtractValuesSync('websites_to_report/websites2.json'); 

    await databaseFuncs.closeConnection();
    process.exit();
}

generateReports()
