//Imports
const { header } = require('express/lib/request');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const puppeteer = require('puppeteer');
const { google, domains_v1alpha2 } = require('googleapis');
const mysql = require('mysql');
const util = require('util');
const { start } = require('repl');
const myAPIcalls = require(__dirname + '/APIcalls'); 
const mySegmentCreation = require(__dirname + '/segmentFunctions'); 
const pdfwriting = require(__dirname + '/PDFwriting'); 
const databaseFuncs = require(__dirname + '/databaseFuncs'); 
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



// Global Values
    const fontPath = 'Fonts/Lato/Lato-Light.ttf';
    const fontPathItalic = 'Fonts/Lato/Lato-Italic.ttf';
    const fontPathBold = 'Fonts/Lato/Lato-Regular.ttf';
    let headerSize = 20;
// Global Values




// Format Functions
    async function formatDate(dateString) {
        // Create a Date object from the input string
        const date = new Date(dateString);
        
        // Format the date as YYYY-MM-DD
        const year = date.getFullYear();
        // getMonth() returns 0-11, adding 1 to get 1-12 for months and padStart to ensure two digits
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        // getDate() returns 1-31, padStart to ensure two digits
        const day = date.getDate().toString().padStart(2, '0');
        
        // Concatenate formatted parts
        return `${year}-${month}-${day}`;
    }
    const formatLocationData = (inputString, header1, header2) => {
        // Parse the input string to JSON
        const jsonData = JSON.parse(inputString);
        
        // Create a new array starting with the headers
        const dataWithValues = [[header1, header2]];
        
        // Map over the parsed JSON to add each item as a sub-array [location, amount]
        jsonData.forEach(item => dataWithValues.push([item.location, item.amount]));
        
        // Return the newly constructed array
        return dataWithValues;
    };

    function formatReferralData(data, header1, header2) {
        // Start with the headers
        let result = `${header1}, ${header2}`;
    
        // Regular expression to match '(not set)' in any capitalization
        const regex = /\(not set\)/ig;
    
        // Iterate over each item in the data array
        data.forEach((item) => {
          // Replace any mention of '(not set)' in the origin with 'Unknown', case-insensitive
          const origin = item[0].replace(regex, 'Unknown');
          const value = item[1];
    
          // Append the modified origin and its corresponding value to the result string
          result += `, ${origin}, ${value}`;
        });
    
        return result;
    }

    function formatDeviceData(data, header1, header2) {
        // Start with the headers
        let result = `${header1}, ${header2}`;
    
        // Regular expression to match '(not set)' in any capitalization
        const regex = /\(not set\)/ig;
    
        // Iterate over each item in the data array
        data.forEach((item) => {
          // Replace any mention of '(not set)' in the browserType with 'Unknown', case-insensitive
          const browserType = item.deviceType.replace(regex, 'Unknown');
          const userCount = item.userCount;
    
          // Append the modified browserType and its corresponding userCount to the result string
          result += `, ${browserType}, ${userCount}`;
        });
    
        return result;
    }

    function formatBrowserData(data, header1, header2) {
        // Start with the headers
        let result = `${header1}, ${header2}`;
    
        // Regular expression to match '(not set)' in any capitalization
        const regex = /\(not set\)/ig;
    
        // Iterate over each item in the data array
        data.forEach((item) => {
          // Replace any mention of '(not set)' in the browserType with 'Unknown', case-insensitive
          const browserType = item.browserType.replace(regex, 'Unknown');
          const userCount = item.userCount;
    
          // Append the modified browserType and its corresponding userCount to the result string
          result += `, ${browserType}, ${userCount}`;
        });
    
        return result;
    }
    
    function formatViewedPageData(data, header1, header2) {
        // Start with the headers
        let result = `${header1},, ${header2},, `; 
    
        // Iterate over each item in the data array
        data.forEach((item) => {
            const pageTitle = item[0];
            const pagePercentage = item[1]; 
            // Append the pageTitle and its corresponding pagePercentage to the result string
            result += `${pageTitle},, ${pagePercentage},, `;
        });
    
        return result;
    }

    function formatDemographicData(data, header1, header2) {
        // Start with the headers
        let result = `${header1}, ${header2}, `; 
    
        // Iterate over each property in the data object
        for (const [key, value] of Object.entries(data)) {
            // Check if the key is "(other)" and replace it with "Other" if so
            const formattedKey = key === "(other)" ? "Other" : key;
            result += `${formattedKey}, ${value}, `;
        }
    
        // Remove the trailing comma and space
        result = result.slice(0, -2);
    
        return result;
    }

    function formatBounceData(data, header1, header2) {
        // Start with the headers
        let result = `${header1}, ${header2}, `; 
    
        // Iterate over each property in the data object
        for (const [key, value] of Object.entries(data)) {
            if(value[0] != '(not Set)'){ //filter out whatever this nonsense is...
                result += `${value}, `;
            }
        }
        // Remove the trailing comma and space
        result = result.slice(0, -2);
    
        return result;
    }

    function formatScrollData(data, header1, header2) {
        // Start with the headers
        let result = `${header1}, ${header2}, `; 
    
        // Iterate over each property in the data object
        for (const [key, value] of Object.entries(data)) {
            if(value[0] != '(not Set)'){ //filter out whatever this nonsense is...
                result += `${value}, `;
            }
        }
        // Remove the trailing comma and space
        result = result.slice(0, -2);
    
        return result;
    }
// Format Functions



// BEFORE BLOCK-GENERATION - Initial Needed Segment Gathering
    async function fetch_clientID_clientFile_startDate_endDate() { //Function to fetch the initial parts of the report from the database so we know what report we are creating and what time frame etc
        try {
            databaseFuncs.openConnection();
            const sql = 'SELECT clientID, clientFile, start_date, end_date FROM Report';
            const results = await query(sql);
            return results; // This will be an array of objects
        } catch (error) {
            console.error('Failed to fetch report details:', error);
        }
    }

    async function processReports() { //Uses clientID, clientFile, startDate, and endDate to popualte the database with the correct API call returned data
        const reports = await fetch_clientID_clientFile_startDate_endDate();

        if (reports && reports.length > 0) {
            for (const report of reports) {
                // Assuming `clientFile` needs to be determined or is a constant
                
                // Now call populateNeededMetrics with all required parameters
                await populateNeededMetrics({
                    clientID: report.clientID,
                    clientFile: report.clientFile,
                    start_date: report.start_date,
                    end_date: report.end_date
                });
            }
        } else {
            console.log('No reports found or failed to fetch report details.');
        }
    }
// BEFORE BLOCK-GENERATION - Initial Needed Segment Gathering



// BEFORE BLOCK-GENERATION - Metric Gathering (API CALLS) and Table Populating
    const populateNeededMetrics = async ({clientID, clientFile, start_date, end_date}) => { //Execute all the metric functions (in another function), then add them to the databse here
        try {

            // Step 1: Find chosen segments
            const chosenSegments = await query('SELECT * FROM Segment WHERE chosen <> 0');

            // Step 2: Find all metric IDs related to those segments
            const metricIds = await Promise.all(chosenSegments.map(async (segment) => {
                const metrics = await query('SELECT metric_id FROM Metric WHERE segment_id = ?', [segment.segment_id]);
                return metrics.map(metric => metric.metric_id);
            }));

            // Flatten the array of arrays
            const flatMetricIds = [].concat(...metricIds);

            //Format the dates for YYYY-MM-DD
            start_date = await formatDate(start_date)
            end_date = await formatDate(end_date)

            // Step 3: Execute functions for the metric IDs with additional parameters
            await executeMetricFunctions(flatMetricIds, clientID, clientFile, start_date, end_date);
        } catch (error) {
            console.error('Error:', error);
        } finally {
        }
    };

    const executeMetricFunctions = async (metricIds, clientID, clientFile, start_date, end_date) => { //Execute any metric functions based off the metric_id's passed through
        console.error(`API calls below:`);
        databaseFuncs.openConnection(); 
        
        // Define a map of metric ID to its corresponding function
        const metricFunctionMap = {
            1: async (clientID, clientFile, start_date, end_date) => {
                console.log(`   Fetching Visitor Count`);
                const visitorCount = await myAPIcalls.getVisitorCount(clientID, clientFile, start_date, end_date); 
                await query('UPDATE Metric SET metric_data = ?, chosen = 1 WHERE metric_id = ?', [visitorCount.toString(), 1]); //Update the database
            },

            2: async (clientID, clientFile, start_date, end_date) => {
                console.log(`   Fetching page_view_count`);
                const pageViewCount = await myAPIcalls.getPageViewCount(clientID, clientFile, start_date, end_date); 
                await query('UPDATE Metric SET metric_data = ?, chosen = 1 WHERE metric_id = ?', [pageViewCount.toString(), 2]); //Update the database
            },

            3: async (clientID, clientFile, start_date, end_date) => {
                console.log(`   Fetching viewed_page_list`);
                let viewedPagesList = await myAPIcalls.getMostVisitedPages(clientID, clientFile, start_date, end_date); 
                viewedPagesList = formatViewedPageData(viewedPagesList, 'Page', 'Percent of Total Views');
                await query('UPDATE Metric SET metric_data = ?, chosen = 1 WHERE metric_id = ?', [viewedPagesList.toString(), 3]); //Update the database
            },

            4: async (clientID, clientFile, start_date, end_date) => {
                console.log(`   Fetching time_spent`);
                const timeSpent = await myAPIcalls.getTimeSpent(clientID, clientFile, start_date, end_date, true); 
                await query('UPDATE Metric SET metric_data = ?, chosen = 1 WHERE metric_id = ?', [timeSpent.toString(), 4]); //Update the database
            },

            5: async (clientID, clientFile, start_date, end_date) => {
                console.log(`   Fetching percentage_new_users`);
                let new_user_count = await myAPIcalls.getAnalyticsData(clientID, clientFile, 'newUsers', start_date, end_date);
                let total_user_count = await myAPIcalls.getAnalyticsData(clientID, clientFile, 'totalUsers', start_date, end_date);
                newUserPercent = (new_user_count / total_user_count) * 100; //find the percentage
                newUserPercent = parseInt(newUserPercent, 10); //Make sure it is an int, in base 10.
                await query('UPDATE Metric SET metric_data = ?, chosen = 1 WHERE metric_id = ?', [newUserPercent.toString(), 5]); //Update the database
            },

            6: async (clientID, clientFile, start_date, end_date) => {
                console.log(`   Fetching visitor location data`);
                let visitor_location_and_amount = await myAPIcalls.getLocation(clientID, clientFile, start_date, end_date);
                visitor_location_and_amount = formatLocationData(visitor_location_and_amount, 'Location', 'Amount');
                await query('UPDATE Metric SET metric_data = ?, chosen = 1 WHERE metric_id = ?', [visitor_location_and_amount.toString(), 6]); //Update the database
            },

            7: async (clientID, clientFile, start_date, end_date) => {
                console.log(`   Fetching referral data`);
                let referral_data = await myAPIcalls.getReferralSessions(clientID, clientFile, start_date, end_date, false); //TODO: Front end, edit so they can see more detail if they want
                referral_data = formatReferralData(referral_data, 'Origin', 'Sessions');
                await query('UPDATE Metric SET metric_data = ?, chosen = 1 WHERE metric_id = ?', [referral_data.toString(), 7]); //Update the database

            },

            8: async (clientID, clientFile, start_date, end_date) => {
                console.log(`   Fetching user_device data`);
                let user_device_data = await myAPIcalls.getDeviceUsage(clientID, clientFile, start_date, end_date); 
                user_device_data = formatDeviceData(user_device_data, 'Device', 'Amount');
                await query('UPDATE Metric SET metric_data = ?, chosen = 1 WHERE metric_id = ?', [user_device_data.toString(), 8]); //Update the database

            },

            9: async (clientID, clientFile, start_date, end_date) => {
                console.log(`   Fetching user_browser data`);
                let user_browser_data = await myAPIcalls.getBrowserUsage(clientID, clientFile, start_date, end_date); 
                user_browser_data = formatBrowserData(user_browser_data, 'Browser', 'Amount');
                await query('UPDATE Metric SET metric_data = ?, chosen = 1 WHERE metric_id = ?', [user_browser_data.toString(), 9]); //Update the database

            },

            10: async (clientID, clientFile, start_date, end_date) => {
                console.log(`   Fetching gender data`);
                let gender_data = await myAPIcalls.getGender(clientID, clientFile, start_date, end_date); 
                gender_data = formatDemographicData(gender_data, 'Gender', 'Amount');
                await query('UPDATE Metric SET metric_data = ?, chosen = 1 WHERE metric_id = ?', [gender_data, 10]); //Update the database
            },

            11: async (clientID, clientFile, start_date, end_date) => {
                console.log(`   Fetching age data`);
                let gender_data = await myAPIcalls.getAge(clientID, clientFile, start_date, end_date); 
                gender_data = formatDemographicData(gender_data, 'Age', 'Amount');
                await query('UPDATE Metric SET metric_data = ?, chosen = 1 WHERE metric_id = ?', [gender_data, 11]); //Update the database
            },

            12: async (clientID, clientFile, start_date, end_date) => {
                console.log(`   Fetching language data`);
                let language_data = await myAPIcalls.getLanguageData(clientID, clientFile, start_date, end_date); 
                language_data = formatDemographicData(language_data, 'Language', 'Amount');
                await query('UPDATE Metric SET metric_data = ?, chosen = 1 WHERE metric_id = ?', [language_data, 12]); //Update the database
            },

            13: async (clientID, clientFile, start_date, end_date) => {
                console.log(`   Fetching bounce_rate data`);
                let bounce_rate_data = await myAPIcalls.getReferralBounceRate(clientID, clientFile, start_date, end_date); 
                bounce_rate_data = formatBounceData(bounce_rate_data, 'Origin', 'Bounce Rate'); 
                await query('UPDATE Metric SET metric_data = ?, chosen = 1 WHERE metric_id = ?', [bounce_rate_data, 13]); //Update the database
            },

            14: async (clientID, clientFile, start_date, end_date) => {
                console.log(`   Fetching scroll_depth data`);
                let scroll_depth_data = await myAPIcalls.getNormalisedScrollDepth(clientID, clientFile, start_date, end_date); 
                scroll_depth_data = formatScrollData(scroll_depth_data, 'Origin', 'Scroll Depth');
                await query('UPDATE Metric SET metric_data = ?, chosen = 1 WHERE metric_id = ?', [scroll_depth_data, 14]); //Update the database
            },
            15: async (clientID, clientFile, start_date, end_date) => {
                console.log(`   Fetching comparison_dates data`);
                let dates = await databaseFuncs.getMetricDataByName('start_and_end_dates');
                await query('UPDATE Metric SET metric_data = ?, chosen = 1 WHERE metric_id = ?', [dates, 15]); //Update the database
            },
        };
        
        // Execute the function corresponding to each metric ID and update the database
        for (let id of metricIds) {
            if (metricFunctionMap.hasOwnProperty(id)) {
                await metricFunctionMap[id](clientID, clientFile, start_date, end_date); // Pass additional parameters to each function
            } else {
                console.log(`No function defined for metric ${id}`);
            }
        }
    };
// BEFORE BLOCK-GENERATION - Metric Gathering (API CALLS) and Table Populating



// DIRECTLY FOR BLOCK GENERATION - main loop function caller, then each segment space-calculator
    async function calcSpaceForAllSegments() {
        await databaseFuncs.openConnection();

        try {
            // Step 1: Fetch all segments with chosen = 1
            const segmentQuery = `SELECT segment_id FROM Segment WHERE chosen = 1`;
            const segmentResults = await databaseFuncs.queryAsync(segmentQuery);

            if (segmentResults.length === 0) {
                console.log("No segments found with chosen = 1.");
                return;
            }
            console.error(`\nSegment Space Calculation:`);
            for (const segment of segmentResults) { //for each chosen segment
                // Step 2: Fetch all metrics for the current segment where chosen = 1
                const metricsQuery = `SELECT metric_id FROM Metric WHERE chosen = 1 AND segment_id = ${segment.segment_id}`;
                const metricResults = await databaseFuncs.queryAsync(metricsQuery);

                if (metricResults.length === 0) {
                    console.error(`No metric data found for segment ${segment.segment_id}`);
                    continue; // Skip to next segment if no metrics found
                }

                // Step 3: Process all metrics for the segment at once, specific to each segment
                // Inside the for loop of calcualteSpaceForAllSegments
                const totalHeight = await eachSegmentSpaceCalc(metricResults, segment.segment_id);


                // Step 4: Update the Segment with the calculated total height
                const updateQuery = `UPDATE Segment SET height = ? WHERE segment_id = ?`;
                await databaseFuncs.queryAsync(updateQuery, [totalHeight, segment.segment_id]);
                console.log(`   - Segment ${segment.segment_id} pushed a height of ${totalHeight} to the database \n`);
            }
        } catch (error) {
            console.error('An error occurred:', error);
        } 
    }

    async function eachSegmentSpaceCalc(metricResults, segment_id) {
        let totalHeight = 0;

        if (segment_id == 1){
            let tempDoc = pdfwriting.createPdfDoc('spaceCalc.pdf', 'Temp');
            totalHeight = await mySegmentCreation.visitorStatisticsFunc(tempDoc, metricResults, true);
            totalHeight = Math.round(totalHeight);
            return totalHeight;
        }

        else if (segment_id == 2){
            let tempDoc = pdfwriting.createPdfDoc('spaceCalc.pdf', 'Temp');
            totalHeight = await mySegmentCreation.visitorLocationFunc(tempDoc, true); //No metric results needed as only 1 metric in this segment
            totalHeight = Math.round(totalHeight);
            return totalHeight;
        }

        else if (segment_id == 3){
            let tempDoc = pdfwriting.createPdfDoc('spaceCalc.pdf', 'Temp');
            totalHeight = await mySegmentCreation.referralsBreakdownFunc(tempDoc, true); //No metric results needed as only 1 metric in this segment
            totalHeight = Math.round(totalHeight);
            return totalHeight;
        }

        else if (segment_id == 4){
            let tempDoc = pdfwriting.createPdfDoc('spaceCalc.pdf', 'Temp');
            totalHeight = await mySegmentCreation.usersByDeviceFunc(tempDoc, true); //No metric results needed as only 1 metric in this segment
            totalHeight = Math.round(totalHeight);
            return totalHeight;
        }

        else if (segment_id == 5){
            let tempDoc = pdfwriting.createPdfDoc('spaceCalc.pdf', 'Temp');
            totalHeight = await mySegmentCreation.usersByBrowserFunc(tempDoc, true); //No metric results needed as only 1 metric in this segment
            totalHeight = Math.round(totalHeight);
            return totalHeight;
        }

        else if (segment_id == 6){
            let tempDoc = pdfwriting.createPdfDoc('spaceCalc.pdf', 'Temp');
            totalHeight = await mySegmentCreation.demographicsFunc(tempDoc, metricResults, true); //No metric results needed as only 1 metric in this segment
            totalHeight = Math.round(totalHeight);
            return totalHeight;
        }

        else if (segment_id == 7){
            let tempDoc = pdfwriting.createPdfDoc('spaceCalc.pdf', 'Temp');
            totalHeight = await mySegmentCreation.engagementFunc(tempDoc, metricResults, true); //No metric results needed as only 1 metric in this segment
            totalHeight = Math.round(totalHeight);
            return totalHeight;
        }

        else if (segment_id == 8){
            let tempDoc = pdfwriting.createPdfDoc('spaceCalc.pdf', 'Temp');
            totalHeight = await mySegmentCreation.comparisonFunc(tempDoc, true); //No metric results needed as only 1 metric in this segment
            totalHeight = Math.round(totalHeight);
            return totalHeight;
        }

        else if (segment_id == 9){
            let tempDoc = pdfwriting.createPdfDoc('spaceCalc.pdf', 'Temp');
            totalHeight = await mySegmentCreation.summaryFunc(tempDoc, true); //No metric results needed as only 1 metric in this segment
            totalHeight = Math.round(totalHeight);
            return totalHeight;
        }

    }
// DIRECTLY FOR BLOCK GENERATION - main loop function caller, then each segment space-calculator



//FINAL REPORT GENERATION STAGE
    async function generateFinalReport() {
        await databaseFuncs.openConnection()

        let finalDoc;
        website_name = await databaseFuncs.getReportWebsite();
            if (website_name) {
                finalDoc = pdfwriting.createPdfDoc(`${website_name}.pdf`, 'Report Outputs');
                await pdfwriting.createCoverPage(finalDoc, website_name, headerSize);
                pdfwriting.nextPage(finalDoc);
            } else {
                finalDoc = pdfwriting.createPdfDoc('Report.pdf', 'Report Outputs');
                await pdfwriting.addContentToPdf(finalDoc, `Website Report`, fontPath, fontPathBold, headerSize * 1.2)
            }

        try {
            // Step 1: Fetch all segments with chosen = 1, ordered by position
            const segmentQuery = `SELECT * FROM Segment WHERE chosen = 1 ORDER BY position ASC`;
            const segments = await databaseFuncs.queryAsync(segmentQuery);

            if (segments.length === 0) {
                console.log("No segments found with chosen = 1.");
                return;
            }
            console.error(`Segments being added:`);

            // Step 2: Process each segment in order
            for (const segment of segments) {
                const metricsQuery = `SELECT * FROM Metric WHERE chosen = 1 AND segment_id = ${segment.segment_id}`;
                const metrics = await databaseFuncs.queryAsync(metricsQuery);

                if (metrics.length === 0) {
                    console.log(`No metrics found for segment ${segment.segment_name} with chosen = 1.`);
                    continue; // Skip to next segment if no metrics found
                }
                
                // Handle each segment based on its name
                switch (segment.segment_name) {

                    case 'visitor_statistics':
                        await mySegmentCreation.visitorStatisticsFunc(finalDoc, metrics, false);
                        break;

                    case 'visitor_location':
                        await mySegmentCreation.visitorLocationFunc(finalDoc, false);
                        break;

                    case 'referrals_breakdown':
                        await mySegmentCreation.referralsBreakdownFunc(finalDoc, false);
                        break;

                    case 'users_by_device':
                        await mySegmentCreation.usersByDeviceFunc(finalDoc, false);
                        break;

                    case 'users_by_browser':
                        await mySegmentCreation.usersByBrowserFunc(finalDoc, false);
                        break;

                    case 'demographics':
                        await mySegmentCreation.demographicsFunc(finalDoc, metrics, false);
                        break;

                    case 'engagement':
                        await mySegmentCreation.engagementFunc(finalDoc, metrics, false);
                        break;

                    case 'comparison':
                        await mySegmentCreation.comparisonFunc(finalDoc, false);
                        break;

                    case 'summary':
                        await mySegmentCreation.summaryFunc(finalDoc, false);
                        break;
            
                    default:
                        console.error(`No specific function for segment: ${segment.segment_name}.`);
                }
            }
        } catch (error) {
            console.error('An error occurred:', error);
        } finally {
            await pdfwriting.finalisePdf(finalDoc); //Close the final document once and for all
            pdfwriting.resetCurrentPageNumber();
        }
    }
//FINAL REPORT GENERATION STAGE



module.exports = {
    processReports,
    calcSpaceForAllSegments,
    generateFinalReport,
    fetch_clientID_clientFile_startDate_endDate
};
