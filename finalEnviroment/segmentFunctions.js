//Imports
const { header } = require('express/lib/request');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const puppeteer = require('puppeteer');
const { google } = require('googleapis');
const mysql = require('mysql');
const util = require('util');
const { start } = require('repl');
const { language } = require('googleapis/build/src/apis/language');
const pdfwriting = require(__dirname + '/PDFwriting'); 
const databaseFuncs = require(__dirname + '/databaseFuncs'); 
const myAPIcalls = require(__dirname + '/APIcalls'); 
//Imports



// Global Values
const fontPath = 'Fonts/Lato/Lato-Light.ttf';
const fontPathBold = 'Fonts/Lato/Lato-Regular.ttf';
const fontPathItalic = 'Fonts/Lato/Lato-Italic.ttf';
const startX = 54; //where the document starts writing to
const startY = 54; //where the document starts writing to
const headerSpaceBelow = 8; // x amount of pixel space below of a header 
const endOfSegmentSpace = 30; // x amount of pixel space below a segment 
let headerSize = 20;
let textSize = 12;
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



///Misc functions
    function parseTableData(inputString, heading1 = 'Heading 1', heading2 = 'Heading 2') {
        // Split the input string by commas to get an array of values
        const elements = inputString.split(',');

        // Initialize the result array with the header
        const result = [[heading1, heading2]];

        // Since the elements are in pairs, iterate through them two at a time
        for (let i = 2; i < elements.length; i += 2) {
            // Remove leading whitespace from location and capitalize the first letter
            const location = elements[i].trimStart().toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
            const amount = parseFloat(elements[i + 1], 10); // Convert amount to a number
            result.push([location, amount]);
        }
        return result;
    }

    async function numberToWord(x) {
        x = Math.max(0, Math.min(10, x)); //make the number between 0 or 10
        // Convert the number to its word representation
        let word = '';
        switch (x) {
        case 0:
            word = 'zero';
            break;
        case 1:
            word = 'one';
            break;
        case 2:
            word = 'two';
            break;
        case 3:
            word = 'three';
            break;
        case 4:
            word = 'four';
            break;
        case 5:
            word = 'five';
            break;
        case 6:
            word = 'six';
            break;
        case 7:
            word = 'seven';
            break;
        case 8:
            word = 'eight';
            break;
        case 9:
            word = 'nine';
            break;
        case 10:
            word = 'ten';
            break;
        default:
            word = 'Invalid number';
        }

        return Promise.resolve(word);
    }

    function clearCopyHeaders(data) { //This function takes any values in the table that repeat, like Direct (Direct), and strips the repetion, leaving just Direct for example
        // Iterate through each entry in the array
        return data.map(entry => {
            // Check if the location matches the pattern "Name (name)"
            // by using a regular expression
            const pattern = /^([A-Za-z\s]+) \(\1\)$/i;
            const match = entry[0].match(pattern);

            if (match) {
                // If the pattern matches, normalize to just the name
                // with its original case
                entry[0] = match[1];
            }
            // Return the possibly modified entry
            return entry;
        });
    }

    async function addAutoChartType(doc, data, heading1 = 'Data', heading2 = 'Amount'){
        if (data.length-1 < 4){
            await pdfwriting.generatePieChartAndEmbed(doc, data, heading1);
        }
        else{
            await pdfwriting.generateGraphAndEmbed(doc, data, heading1);
        }
    }

    function numberWithCommas(x) {
        if (typeof x !== 'number') {
            const numberValue = Number(x);
            try{
                const parts = x.toString().split('.');
                parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                return parts.join('.');
            }catch{
                return x;
            }
        }
      
        const parts = x.toString().split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return parts.join('.');
    }

    async function spaceCalcMessage(doc, spaceCalcMode, title){
        if(spaceCalcMode == true){
            console.log(`   Calculating the space for ${title} Function`);
        }
        else{
            console.log(`   Running ${title} Function`);
            await goToAppropriatePage(doc, title);
        }
    }

    function splitDates(dateString) {
        const dates = dateString.split(',').map(date => date.trim());
        
        if (dates.length !== 2) { //if not 2 dates
          throw new Error('Invalid input: Expected two dates separated by a comma.');
        }
      
        // destructure the dates array into two variables
        const [startDate, endDate] = dates;
      
        // Return the dates in an object for further use
        return { startDate, endDate };
    }

    const fetchCompData = async (metricIds, clientID, clientFile, start_date, end_date) => {
    
        const metricFunctionMap = {
            1: async () => myAPIcalls.getVisitorCount(clientID, clientFile, start_date, end_date),
            2: async () => myAPIcalls.getPageViewCount(clientID, clientFile, start_date, end_date),
            3: async () => {
                let viewedPagesList = await myAPIcalls.getMostVisitedPages(clientID, clientFile, start_date, end_date);
                return formatViewedPageData(viewedPagesList, 'Page', 'Percent of Total Views');
            },
            4: async () => myAPIcalls.getTimeSpent(clientID, clientFile, start_date, end_date, true),
            5: async () => {
                let new_user_count = await myAPIcalls.getAnalyticsData(clientID, clientFile, 'newUsers', start_date, end_date);
                let total_user_count = await myAPIcalls.getAnalyticsData(clientID, clientFile, 'totalUsers', start_date, end_date);
                let newUserPercent = (new_user_count / total_user_count) * 100;
                return parseInt(newUserPercent, 10);
            },
            6: async () => {
                let visitor_location_and_amount = await myAPIcalls.getLocation(clientID, clientFile, start_date, end_date);
                return formatLocationData(visitor_location_and_amount, 'Location', 'Amount');
            },
            7: async () => {
                let referral_data = await myAPIcalls.getReferralSessions(clientID, clientFile, start_date, end_date, true);
                return formatReferralData(referral_data, 'Origin', 'Sessions');
            },
            8: async () => {
                let user_device_data = await myAPIcalls.getDeviceUsage(clientID, clientFile, start_date, end_date);
                return formatDeviceData(user_device_data, 'Device', 'Amount');
            },
            9: async () => {
                let user_browser_data = await myAPIcalls.getBrowserUsage(clientID, clientFile, start_date, end_date);
                return formatBrowserData(user_browser_data, 'Browser', 'Amount');
            },
            10: async () => {
                let gender_data = await myAPIcalls.getGender(clientID, clientFile, start_date, end_date);
                return formatDemographicData(gender_data, 'Gender', 'Amount');
            },
            11: async () => {
                let age_data = await myAPIcalls.getAge(clientID, clientFile, start_date, end_date);
                return formatDemographicData(age_data, 'Age', 'Amount');
            },
            12: async () => {
                let language_data = await myAPIcalls.getLanguageData(clientID, clientFile, start_date, end_date);
                return formatDemographicData(language_data, 'Language', 'Amount');
            },
            13: async () => {
                let bounce_rate_data = await myAPIcalls.getReferralBounceRate(clientID, clientFile, start_date, end_date);
                return formatBounceData(bounce_rate_data, 'Origin', 'Bounce Rate');
            },
            14: async () => {
                let scroll_depth_data = await myAPIcalls.getNormalisedScrollDepth(clientID, clientFile, start_date, end_date);
                return formatScrollData(scroll_depth_data, 'Origin', 'Scroll Depth');
            },
            15: async () => databaseFuncs.getMetricDataByName('start_and_end_dates'),
        };
    
        let results = [];
    
        for (let id of metricIds) {
            if (metricFunctionMap.hasOwnProperty(id)) {
                console.log(`       Fetching data for metric ${id}`);
                const data = await metricFunctionMap[id]();
                results.push([id, data]);
            } else {
                if(id == 16) //If summary func
                {
                    //pass
                }
                else{
                    console.log(`       No function defined for metric ${id}`);
                }
            }
        }
    
        return results;
    };

    async function fetch_clientID_clientFile() { //Function to fetch the initial parts of the report from the database so we know what report we are creating and what time frame etc
        try {
            databaseFuncs.openConnection();
            const sql = 'SELECT clientID, clientFile FROM Report';
            const results = await query(sql);
            return results; // This will be an array of objects
        } catch (error) {
            console.error('Failed to fetch report details:', error);
        }
    }

    async function fetchReportDates() { // Simplified function name for clarity
        try {
            // Assuming openConnection() is necessary for your setup, it's kept as is.
            databaseFuncs.openConnection(); 
            const sql = 'SELECT start_date, end_date FROM Report'; // Query modified to select only start_date and end_date
            const results = await query(sql);
            return results; // This will return an array of objects with start_date and end_date properties
        } catch (error) {
            console.error('Failed to fetch report dates:', error);
        }
    }
    
    async function fetchAndFormatDateRange(reportId, nonFetchDates = false, start = '', end = '') {
        // Function to determine the suffix for a day
        const nth = (d) => {
            if (d > 3 && d < 21) return 'th';
            switch (d % 10) {
              case 1:  return "st";
              case 2:  return "nd";
              case 3:  return "rd";
              default: return "th";
            }
        };
    
        // Function to format a date
        const formatDate = (dateStr) => {
            const date = new Date(dateStr);
            return `${date.getDate()}${nth(date.getDate())} of ${date.toLocaleString('en-US', { month: 'long' })}`;
        };
    
        // Function to check if both dates are in the same month
        const isSameMonth = (dateStr1, dateStr2) => {
            const date1 = new Date(dateStr1);
            const date2 = new Date(dateStr2);
            return date1.getMonth() === date2.getMonth() && date1.getFullYear() === date2.getFullYear();
        };

        if(nonFetchDates == true){ //If custom date import
            if (isSameMonth(start, end)) {
                const startDay = new Date(start).getDate();
                const endDay = new Date(end).getDate();
                const month = new Date(start).toLocaleString('en-US', { month: 'long' });
                return `${startDay}${nth(startDay)} to the ${endDay}${nth(endDay)} of ${month}`;
            } else {
                return `${formatDate(start)} to ${formatDate(end)}`;
            }
        }

        const { startDate, endDate } = await databaseFuncs.getReportDatesById(reportId); // Fetch dates
    
        // Decide format based on whether the dates are in the same month
        if (isSameMonth(startDate, endDate)) { //If regualr report  table DB fetch
            const startDay = new Date(startDate).getDate();
            const endDay = new Date(endDate).getDate();
            const month = new Date(startDate).toLocaleString('en-US', { month: 'long' });
            return `${startDay}${nth(startDay)} to the ${endDay}${nth(endDay)} of ${month}`; //If same month
        } else {
            return `${formatDate(startDate)} to the ${formatDate(endDate)}`;
        }
    }
///Misc functions



//Database Basic Info
    const connection = mysql.createConnection({
        host: 'mysql.addns.co.uk',
        port: 3306,
        user: 'reporttesting_nodejs',
        password: 'nodeJS12345!',
        database: 'reporttesting_reportwriting'
    });
    const query = util.promisify(connection.query).bind(connection);
//Database Basic Info



//Helper segments for functions
    async function goToAppropriatePage(doc, segment_name){
        currentPageNumber = await pdfwriting.getPageNumber(doc);
        neededPageNumber = await databaseFuncs.getSegmentPageNumberByName(segment_name);
        const pagesToAdd = neededPageNumber - currentPageNumber;
        if (pagesToAdd > 0){
            for (let i = 0; i < pagesToAdd; i++) {
                pdfwriting.nextPage(doc);          
            }}
        if (pagesToAdd < 0) {
            console.error(`Something has gone wrong. Position of segment to be added is on a previous page (${neededPageNumber})... we are now on page ${currentPageNumber}\nPutting Segment on this page instead`);
        }
    }
//Helper segments for functions



async function visitorStatisticsFunc(doc, metricResults, spaceCalcMode = false, ) {
    try{
        await spaceCalcMessage(doc, spaceCalcMode, 'visitor_statistics')
        startPos = await pdfwriting.getMarginTop(); 
    ;
    
        try {
        // Convert metricResults into a Set for quick lookup
        const selectedMetricIds = new Set(metricResults.map(metric => metric.metric_id));
    
        const metrics = [
            'visitor_count',       // metric_id 1
            'page_view_count',     // metric_id 2
            'viewed_pages_list',   // metric_id 3
            'time_spent',          // metric_id 4
            'percentage_new_users' // metric_id 5
        ];
        
        let statisticsParts = [];
        
        const getSentence = (metricName, metricData, useFirstSentence, isFirstMetric, dateRange) => {
            function extractItemOrValue(inputString, getItem = true, itemIndex = 1, excludePipe = true) {
                // Assuming the first two elements are headings and thus skipping them
                // Adjust the index to account for these headings
                const adjustedIndex = (itemIndex - 1) * 2 + 2;
            
                // Split the input string into an array using double commas, trimming whitespace
                const elements = inputString.split(',,').map(element => element.trim());
            
                // Check if the adjustedIndex is within the bounds of the array, excluding headings
                if (adjustedIndex < 2 || adjustedIndex >= elements.length) {
                    return ''; // Return an empty string if out of bounds
                }
            
                let selectedElement;
                if (getItem) {
                    // Return the item name
                    selectedElement = elements[adjustedIndex];
                } else {
                    // Return the item's value (next element in the array)
                    selectedElement = elements.length > adjustedIndex + 1 ? elements[adjustedIndex + 1] : '';
                }
            
                // If excludePipe is true, check for the presence of a pipe symbol and exclude it and anything after it
                if (excludePipe && selectedElement.includes('|')) {
                    // Find the index of the pipe symbol
                    const pipeIndex = selectedElement.indexOf('|');
                    // Return the substring up to (but not including) the pipe symbol
                    return selectedElement.substring(0, pipeIndex).trim();
                }
            
                // Return the selected element as is if there's no pipe or if excludePipe is false
                return selectedElement;
            }
            
            const templates = {
                'visitor_count': [
                    `From the ${dateRange}, the website generated *${numberWithCommas(metricData)}* visitors`,
                    `The website generated *${numberWithCommas(metricData)}* visitors ${dateRange}`,
                    `From the ${dateRange}, the website generated *${numberWithCommas(metricData)}* visitors`
                ],
                'page_view_count': [
                    ` and produced *${numberWithCommas(metricData)} page views*`, //One before existed
                    `A total of *${numberWithCommas(metricData)} pages* were viewed by visitors`, //One before didn't exist, but not first
                    `Visitors viewed a total of *${numberWithCommas(metricData)} pages*` // First metric in whole paragraph
                ],
                'viewed_pages_list': [
                    `, with the most viewed page being '*${extractItemOrValue(metricData, true, 1)}*' at *${extractItemOrValue(metricData, false, 1)}* of total page views. This was followed by '*${extractItemOrValue(metricData, true, 2)}*' with a share of *${extractItemOrValue(metricData, false, 2)}* total page views`, // Previous metric
                    `. Notably, the '*${extractItemOrValue(metricData, true, 1)}*' page drew the most interest with *${extractItemOrValue(metricData, false, 1)}* of total page views. This was followed by '*${extractItemOrValue(metricData, true, 2)}*' with a share of *${extractItemOrValue(metricData, false, 2)}* total page views`, //No previous metric
                    `The highlight of the website was the '*${extractItemOrValue(metricData, true, 1)}*' page, capturing *${extractItemOrValue(metricData, false, 1)}* of total page views. This was followed by '*${extractItemOrValue(metricData, true, 2)}*' with a share of *${extractItemOrValue(metricData, false, 2)}* total page views` // First metric
                ],
                'time_spent': [
                    `. Visitors also spent an average of *${metricData}* on the site`,
                    `. The average visit duration for the website was *${metricData}*`,
                    `Engagement was ${metricData < 20 ? 'low' : metricData < 45 ? 'decent' : 'high'}, with an average visit duration of *${metricData}*` // First metric
                ],
                'percentage_new_users': [
                    `, with *${metricData}%* of them being new users. Your site is ${metricData > 50 ? 'clearly attracting a lot of fresh interest' : metricData > 25 ? 'attracting a good amount of new users' : metricData >= 1 ? 'attracting a few new users' : 'currently experiencing no growth in new user acquisition'}`, // Previous metric
                    `. Interestingly, *${metricData}%* of your users were new. This points to your site's ${metricData > 50 ? 'rapidly expanding reach' : metricData > 25 ? 'notably increasing reach' : metricData >= 5 ? 'moderately expanding reach' : 'limited expansion in reach'}`, //No previous metric
                    `Interestingly, *${metricData}%* of visitors were new users, indicating ${metricData > 50 ? 'a high level of growing interest' : metricData > 25 ? 'a substantial increase in interest' : metricData >= 5 ? 'some growing interest' : 'minimal new interest'}` // First metric
                ],
            };
            
    
            const choices = templates[metricName];
            // Choose sentence based on isFirstMetric flag or whether the previous metric_id is selected
            if (isFirstMetric) {
                return choices[2]; // First metric case
            } else {
                return useFirstSentence ? choices[0] : choices[1]; // Fallback to first if second is not available
            }
        };
        
        const dateRange = await fetchAndFormatDateRange(1);
    
        for (let i = 0; i < metrics.length; i++) {
            const metricName = metrics[i];
            const metricId = i + 1; // Assuming metric_id starts at 1
            if (selectedMetricIds.has(metricId)) {
                const metricData = await databaseFuncs.getMetricDataByName(metricName); // Retrieve actual metric data
        
                // Check if this is the first metric being added to the statistics
                const isFirstMetric = statisticsParts.length === 0;
        
                // Check if the previous metricId was selected to decide which sentence to use
                const useFirstSentence = selectedMetricIds.has(metricId - 1);
        
                // getSentence also needs the dateRange as a parameter
                const sentence = getSentence(metricName, metricData, useFirstSentence, isFirstMetric, dateRange);
                
                statisticsParts.push(sentence);
            }
        }
        
        // Crafting the final paragraph with improved transitions and structure
        let finalParagraph = "";
        if (statisticsParts.length > 0) {
            finalParagraph = statisticsParts.join('');
            finalParagraph = finalParagraph + '.';
        }
    
        pdfwriting.addContentToPdf(doc, `*Visitor Statistics*\n`, fontPath, fontPathBold, headerSize, false); 
        pdfwriting.addSpace(doc, headerSpaceBelow);
    
        pdfwriting.addContentToPdf(doc, finalParagraph, fontPath, fontPathBold, textSize);
        pdfwriting.addSpace(doc, endOfSegmentSpace);
    
    
        if(spaceCalcMode == true){
            endPos = await pdfwriting.finalisePdf(doc, true);
            heightDiff = endPos - startPos;
            return heightDiff
        }} catch (error) {
            console.error('Error:', error);
        }
    } catch{
        console.error('There was an error with the visitor statistics function, not adding to the report') 
    }
}

async function visitorLocationFunc(doc, spaceCalcMode = false) {
    try{
        await spaceCalcMessage(doc, spaceCalcMode, 'visitor_location')
        startPos = await pdfwriting.getMarginTop(); 
    
    
        let visitor_location_and_amount;
        needData = await databaseFuncs.getChosenValueAsBoolean('visitor_location_and_amount') //See if the user wants the only metric for this segment (I imagine this will be locked in the front end UI so it always says yes, but just incase)
        if (needData == true){
            visitor_location_and_amount = await databaseFuncs.getMetricDataByName('visitor_location_and_amount');
        }
    
        const data = parseTableData(visitor_location_and_amount, 'Location', 'Visitors'); 
        const countryCount = data.length - 1; //Minus 1 due to the headings
    
        //Adding to PDF
            await pdfwriting.addContentToPdf(doc, `*Visitor Location*\n`, fontPath, fontPathBold, headerSize, false); 
            await pdfwriting.addSpace(doc, headerSpaceBelow);
            await pdfwriting.addContentToPdf(doc, `The top ${await numberToWord(countryCount)} countries to visit the site were as follows::\n`, fontPath, fontPathBold, textSize, false); 
            await pdfwriting.addSpace(doc, headerSpaceBelow + ((headerSize - textSize)/2)); //counteract the line spacing so it is an even gap
    
            await pdfwriting.generateTableAndEmbed(doc, data, false);
            await pdfwriting.addSpace(doc, headerSpaceBelow + ((headerSize - textSize)/2));
    
            // Check if the data exists and is in the expected format
            if (!data || !Array.isArray(data) || data.length < 3 || !Array.isArray(data[1]) || !Array.isArray(data[2]) || data[1].length < 2 || data[2].length < 2) {
                throw new Error('Data is missing or not in the expected format.');
            }
            
            // If the checks pass, proceed with adding content to the PDF
            await pdfwriting.addContentToPdf(doc, `*${numberWithCommas(data[1][1])}* of the visitors originated from ${data[1][0].startsWith('United') ? 'the ' : ''}*${data[1][0]}*, followed by *${numberWithCommas(data[2][1])}* from ${data[2][0].startsWith('United') ? 'the ' : ''}*${data[2][0]}*.`, fontPath, fontPathBold, textSize, false);
            await pdfwriting.addSpace(doc, endOfSegmentSpace);
        //Adding to PDF
    
        if(spaceCalcMode == true){
            endPos = await pdfwriting.finalisePdf(doc, true);
            heightDiff = endPos - startPos;
            return heightDiff
        }
    } catch{
        console.error('There was an error with the visitor location, not adding to the report')
    }
}

async function referralsBreakdownFunc(doc, spaceCalcMode = false) {
    try{
        await spaceCalcMessage(doc, spaceCalcMode, 'referrals_breakdown')

        startPos = await pdfwriting.getMarginTop(); 
    
        needData = await databaseFuncs.getChosenValueAsBoolean('referral_data') //See if the user wants the only metric for this segment (I imagine this will be locked in the front end UI so it always says yes, but just incase)
    
        if (needData == true){
            referral_data = await databaseFuncs.getMetricDataByName('referral_data', 'Origin', 'Amount');
        }
    
        let data = parseTableData(referral_data, 'Origin', 'Amount'); 
        data = clearCopyHeaders(data);
    
        //Adding to PDF
        await pdfwriting.addContentToPdf(doc, `*Referral Breakdown*\n`, fontPath, fontPathBold, headerSize, false); 
        await pdfwriting.addSpace(doc, headerSpaceBelow);
        await pdfwriting.addContentToPdf(doc, `The following visitors originated from the referral:\n`, fontPath, fontPathBold, textSize, false); 
        await pdfwriting.addSpace(doc, headerSpaceBelow + ((headerSize - textSize)/2)); //counteract the line spacing so it is an even gap
        await addAutoChartType(doc, data, 'Origin')
        await pdfwriting.addSpace(doc, headerSpaceBelow);
    
    
        // Check if the data exists and is in the expected format
            if (!data || !Array.isArray(data) || data.length < 3 || !Array.isArray(data[1]) || !Array.isArray(data[2]) || data[1].length < 2 || data[2].length < 2) {
                throw new Error('Data is missing or not in the expected format.');
            }
            
        // If the checks pass, proceed with adding content to the PDF
        await pdfwriting.addSpace(doc, 5);
        text = `*${data[1][0]}* was at *${numberWithCommas(data[1][1])}* sessions, with *${data[2][0]}* at *${numberWithCommas(data[2][1])}* sessions and *${data[3][0]}* at *${numberWithCommas(data[3][1])}* sessions.`
        await pdfwriting.addContentToPdf(doc, text, fontPath, fontPathBold, textSize, false);
        await pdfwriting.addSpace(doc, endOfSegmentSpace);
    
        if(spaceCalcMode == true){
            endPos = await pdfwriting.finalisePdf(doc, true);
            heightDiff = endPos - startPos;
            return heightDiff
        }
        return
    } catch{
        console.error('There was an error with the referrals breakdown function, not adding to the report')
    }
}

async function pagesViewedFunc(doc, clientID, clientFile) {
    console.log('Running Pages Viewed Function');
}

async function demographicsFunc(doc, metricResults, spaceCalcMode = false) {
    try{
        await spaceCalcMessage(doc, spaceCalcMode, 'demographics')
        startPos = await pdfwriting.getMarginTop(); 
    
    
        // Convert metricResults into a Set for quick lookup
        const selectedMetricIds = new Set(metricResults.map(metric => metric.metric_id));
    
        const metrics = [
            'gender',       // metric_id 10
            'age',     // metric_id 11
            'language'   // metric_id 12
        ];
        pdfwriting.addContentToPdf(doc, `*Demographics*\n`, fontPath, fontPathBold, headerSize, false); 
        await pdfwriting.addSpace(doc, headerSpaceBelow);
    
        for (let i = 9; i < metrics.length + 9; i++) {
            const metricName = metrics[i-9];
            const metricId = i + 1; 
    
            if (selectedMetricIds.has(metricId)) { //Gets each metric_ID IF chosen
                let metricData = await databaseFuncs.getMetricDataByName(metricName); //Get metric name
                metricLabelCapital = metricName.charAt(0).toUpperCase() + metricName.slice(1) //Get capitalised version of the name
                metricDataLength = metricData.slice(0, 10); //get length of the data
    
                if(metricName == 'gender'){
                    metricData = parseTableData(metricData, metricLabelCapital, 'Amount');
    
                    if(selectedMetricIds.has(11)){ //If we have age as well
                        await pdfwriting.addContentToPdf(doc, 'Below are pie charts detailing the gender and age distribution of your visitors:\n', fontPath, fontPathBold, textSize, false); 
                        await pdfwriting.addSpace(doc, headerSpaceBelow*2);
                        let metricDataAge = await databaseFuncs.getMetricDataByName('age');
                        metricDataAge = parseTableData(metricDataAge, 'Age', 'Ranges') 
    
                        let pieDataGender = metricData.map(row => row.slice());
                            const index = pieDataGender.findIndex(row => row[0] === 'Unknown');
                            if (index !== -1) {
                                pieDataGender.splice(index, 1); // Remove the found entry
                            }
    
                        let pieDataAge = metricDataAge.map(row => row.slice());
                            const index2 = pieDataAge.findIndex(row => row[0] === 'Unknown');
                            if (index2 !== -1) {
                                pieDataAge.splice(index2, 1); // Remove the found entry
                            }
    
    
                        await pdfwriting.generateDualPieChartsAndEmbed(doc, pieDataGender, pieDataAge, ['Gender', 'Age']) 
                        await pdfwriting.addSpace(doc, headerSpaceBelow*3);
                    
    
                        data_length = metricData.length - 1;
    
                        if(metricData[1][0] == 'Unknown' && data_length > 2){ //if there are 3 or more genders (1 of which unknown) and unknown is the most popular
                            let totalNumberOfGenderEntries = metricData.slice(2).reduce((accumulator, currentValue) => accumulator + currentValue[1], 0);
                            await pdfwriting.addContentToPdf(doc, `The analysis reveals that a considerable number of your visitors prefer not to share their gender information with Google. When excluding this undisclosed data, our findings show that *${parseFloat((metricData[2][1]/(totalNumberOfGenderEntries)*100).toFixed(1))}*% of visitors were *${metricData[2][0]}*, with the remaining *${parseFloat((metricData[3][1]/(totalNumberOfGenderEntries)*100).toFixed(1))}*% being *${metricData[3][0]}*.`, fontPath, fontPathBold, textSize, false); 
                        }
                        else if(metricData[1][0] == 'Unknown' && data_length > 1){ //If only 'Unknown' and 1 other gender...
                            await pdfwriting.addContentToPdf(doc, `After removing this undisclosed gender data, all identifiable visitors are *${metricData[2][0]}*.`, fontPath, fontPathBold, textSize, false); 
    
                        }
                        else if(data_length > 2 && metricData[2][0] == 'Unknown'){ //if unknown is second and there are at least 3 options.
                            let totalNumberOfGenderEntries = metricData
                                                                        .filter((_, index) => index !== 0 && index !== 2) // Exclude the first and third entries
                                                                        .reduce((accumulator, currentValue) => accumulator + currentValue[1], 0);
                            await pdfwriting.addContentToPdf(doc, `The analysis reveals that *${parseFloat((metricData[1][1]/(totalNumberOfGenderEntries)*100).toFixed(1))}*% of visitors were *${metricData[1][0]}*, after deducting the subset of visitors who choose not prefer not to share their gender information with Google. Excluding the annonmous visitors, *${parseFloat((metricData[3][1]/(totalNumberOfGenderEntries)*100).toFixed(1))}*% of visitors were *${metricData[3][0]}*.`, fontPath, fontPathBold, textSize, false); 
    
                        }
                        else if(data_length > 1 && metricData[2][0] == 'Unknown'){ //if unknown is second and there are 2 options only.
                            await pdfwriting.addContentToPdf(doc, `The analysis reveals that *100*% of visitors were *${metricData[1][0]}*, after deducting the subset of visitors who choose not prefer not to share their gender information with Google.`, fontPath, fontPathBold, textSize, false); 
    
                        }
                        else if(data_length > 2 && metricData[3][0] == 'Unknown'){ //if unknown is third and there are at least 3 options.
                            let totalNumberOfGenderEntries = metricData
                                                                        .filter((_, index) => index !== 0 && index !== 3) // Exclude the first and fourth entries
                                                                        .reduce((accumulator, currentValue) => accumulator + currentValue[1], 0);
                            await pdfwriting.addContentToPdf(doc, `After removing the undisclosed gender data from users who do not wish to share their data with google, *${parseFloat((metricData[1][1]/(totalNumberOfGenderEntries)*100).toFixed(1))}*% of visitors were *${metricData[1][0]}* and *${parseFloat((metricData[2][1]/(totalNumberOfGenderEntries)*100).toFixed(1))}*% were *${metricData[2][0]}*.`, fontPath, fontPathBold, textSize, false); 
                        }
                        else if(data_length > 2){
                            await pdfwriting.addContentToPdf(doc, `*${numberWithCommas(metricData[1][1])}* *${metricData[1][0]}* visitors visited the page, along with *${numberWithCommas(metricData[2][1])}* *${metricData[2][0]}* visitors.`, fontPath, fontPathBold, textSize, false); 
                        }
                        else if(data_length == 1 && metricData[1][0] == 'Unknown'){
                            await pdfwriting.addContentToPdf(doc, `All *${numberWithCommas(metricData[1][1])}* of the visitors that visited the page were *${metricData[1][0]}*. This is due to the fact none of the visitors choose to share their gender infomration with Google.`, fontPath, fontPathBold, textSize, false); 
                        }
                        else if(data_length == 1){
                            await pdfwriting.addContentToPdf(doc, `All *${numberWithCommas(metricData[1][1])}* of the visitors that visited the page were *${metricData[1][0]}*.`, fontPath, fontPathBold, textSize, false); 
                        }
                        else{
                            await pdfwriting.addContentToPdf(doc, `We had some trouble finding any visitors gender information. It is possible the website didn't produce any views, or potentially there was a mistake made elsewhere. Please contact support if you think this is an error.`, fontPath, fontPathBold, textSize, false); 
                        }
                    }
    
                    else{ //if just gender
                        await pdfwriting.addContentToPdf(doc, `Below is the gender distribution of your visitors:\n`, fontPath, fontPathBold, textSize, false); 
                        await pdfwriting.addSpace(doc, headerSpaceBelow*2);
    
                        await pdfwriting.generatePieChartAndEmbed(doc, metricData, 'Gender') 
                        await pdfwriting.addSpace(doc, headerSpaceBelow*3);
                    
    
                        data_length = metricData.length - 1;
                        if(metricData[1][0] == 'Unknown' && data_length > 2){ //if there are 3 or more genders (1 of which unknown) and unknown is the most popular
                            let totalNumberOfGenderEntries = metricData.slice(2).reduce((accumulator, currentValue) => accumulator + currentValue[1], 0);
                            await pdfwriting.addContentToPdf(doc, `The analysis reveals that a considerable number of your visitors prefer not to share their gender information with Google. When excluding this undisclosed data, our findings show that *${parseFloat((metricData[2][1]/(totalNumberOfGenderEntries)*100).toFixed(1))}*% of visitors were *${metricData[2][0]}*, with the remaining *${parseFloat((metricData[3][1]/(totalNumberOfGenderEntries)*100).toFixed(1))}*% being *${metricData[3][0]}*.`, fontPath, fontPathBold, textSize, false); 
                        }
                        else if(metricData[1][0] == 'Unknown' && data_length > 1){ //If only 'Unknown' and 1 other gender...
                            await pdfwriting.addContentToPdf(doc, `After removing this undisclosed gender data, all identifiable visitors are *${metricData[2][0]}*.`, fontPath, fontPathBold, textSize, false); 
    
                        }
                        else if(data_length > 2 && metricData[2][0] == 'Unknown'){ //if unknown is second and there are at least 3 options.
                            let totalNumberOfGenderEntries = metricData
                                                                        .filter((_, index) => index !== 0 && index !== 2) // Exclude the first and third entries
                                                                        .reduce((accumulator, currentValue) => accumulator + currentValue[1], 0);
                            await pdfwriting.addContentToPdf(doc, `The analysis reveals that *${parseFloat((metricData[1][1]/(totalNumberOfGenderEntries)*100).toFixed(1))}*% of visitors were *${metricData[1][0]}*, after deducting the subset of visitors who choose not prefer not to share their gender information with Google. Excluding the annonmous visitors, *${parseFloat((metricData[3][1]/(totalNumberOfGenderEntries)*100).toFixed(1))}*% of visitors were *${metricData[3][0]}*.`, fontPath, fontPathBold, textSize, false); 
    
                        }
                        else if(data_length > 1 && metricData[2][0] == 'Unknown'){ //if unknown is second and there are 2 options only.
                            await pdfwriting.addContentToPdf(doc, `The analysis reveals that *100*% of visitors were *${metricData[1][0]}*, after deducting the subset of visitors who choose not prefer not to share their gender information with Google.`, fontPath, fontPathBold, textSize, false); 
    
                        }
                        else if(data_length > 2 && metricData[3][0] == 'Unknown'){ //if unknown is third and there are at least 3 options.
                            let totalNumberOfGenderEntries = metricData
                                                                        .filter((_, index) => index !== 0 && index !== 3) // Exclude the first and fourth entries
                                                                        .reduce((accumulator, currentValue) => accumulator + currentValue[1], 0);
                            await pdfwriting.addContentToPdf(doc, `After removing the undisclosed gender data from users who do not wish to share their data with google, *${parseFloat((metricData[1][1]/(totalNumberOfGenderEntries)*100).toFixed(1))}*% of visitors were *${metricData[1][0]}* and *${parseFloat((metricData[2][1]/(totalNumberOfGenderEntries)*100).toFixed(1))}*% were *${metricData[2][0]}*.`, fontPath, fontPathBold, textSize, false); 
                        }
                        else if(data_length > 2){
                            await pdfwriting.addContentToPdf(doc, `*${numberWithCommas(metricData[1][1])}* *${metricData[1][0]}* visitors visited the page, along with *${numberWithCommas(metricData[2][1])}* *${metricData[2][0]}* visitors.`, fontPath, fontPathBold, textSize, false); 
                        }
                        else if(data_length == 1 && metricData[1][0] == 'Unknown'){
                            await pdfwriting.addContentToPdf(doc, `All *${numberWithCommas(metricData[1][1])}* of the visitors that visited the page were *${metricData[1][0]}*. This is due to the fact none of the visitors choose to share their gender infomration with Google.`, fontPath, fontPathBold, textSize, false); 
                        }
                        else if(data_length == 1){
                            await pdfwriting.addContentToPdf(doc, `All *${numberWithCommas(metricData[1][1])}* of the visitors that visited the page were *${metricData[1][0]}*.`, fontPath, fontPathBold, textSize, false); 
                        }
                        else{
                            await pdfwriting.addContentToPdf(doc, `We had some trouble finding any visitors gender information. It is possible the website didn't produce any views, or potentially there was a mistake made elsewhere. Please contact support if you think this is an error.`, fontPath, fontPathBold, textSize, false); 
                        }
                    }
                }
    
                else if (metricName == 'age'){ 
                    metricData = parseTableData(metricData, 'Age range', 'Amount');
    
                    const index = metricData.findIndex(row => row[0] === 'Unknown');
                    if (index !== -1) {
                        metricData.splice(index, 1); // Remove the found entry
                    }
                    let age_desc;
    
                    let totalNumberOfAgeEntries = metricData
                                                                .filter((_, index) => index !== 0 ) // Exclude the first entry (headings)
                                                                .reduce((accumulator, currentValue) => accumulator + currentValue[1], 0);
    
                    try{
                        if(metricData[1][0] == '18-24' || metricData[1][0] == '25-34'){
                            try{
                                if(metricData[2][0] == '18-24' || metricData[2][0] == '25-34'){
                                    age_desc = 'the *younger age groups*'; //If first 2 are youngest age groups
                                }
                                    else{
                                        age_desc = 'the *youngest age group*'; //If first group is young, but second is middle or old
                                    }
                                }
                            
                            catch{
                                age_desc = 'the *youngest age group*'
                            }
                        }
        
                        else if(metricData[1][0] == '35-44' || metricData[1][0] == '45-54'){
                            try{
    
                                if(metricData[2][0] == '35-44' || metricData[2][0] == '45-54'){
                                    age_desc = 'the *central age groups*'; //If first 2 are youngest age groups
                                }
                                    else{
                                        age_desc = 'one of the *central age groups*'; //If first group is young, but second is middle or old
                                    }
                                }
                            catch{
                                age_desc = 'the *middle years*'
                            }
                        }
        
                        else if(metricData[1][0] == '55-64' || metricData[1][0] == '65+'){
                            try{
                                if(metricData[2][0] == '55-64' || metricData[2][0] == '65+'){
                                    age_desc = 'the *older age groups*'; //If first 2 are youngest age groups
                                }
                                    else{
                                        age_desc = 'one of the *oldest age groups*'; //If first group is young, but second is middle or old
                                    }
                            }
                            catch{
                                age_desc = 'the *oldest age group*'
                            }
    
                        }
        
                        else{ //Fail safe!
                            age_desc = `the ${metricData[1][0]} age group`; 
                        }
                    }
    
                    catch{
                        console.error('Not enough age catagories to fully report on, generating a simple sentence instead. this really shouldnt be ran...')
                    }
    
    
                    const exactThreshold = 0; // No difference, exactly the same
                    const nearIdenticalThreshold = 1; // Percentage difference for "near identical"
                    const slightlyThreshold = 10; // Percentage difference for "slightly smaller"
                    const moderatelyThreshold = 25; // Percentage difference for "moderately smaller"
                    const massivelyThreshold = 50; // Percentage difference for "massively smaller"
                    
                    let statement;
                    try{
                        // Calculate the absolute percentage difference
                        const percentageDifference = ((metricData[1][1] - metricData[2][1]) / metricData[1][1]) * 100;
                        
                        if (percentageDifference === exactThreshold) {
                            statement = 'the exact same';
                        } else if (percentageDifference > exactThreshold && percentageDifference <= nearIdenticalThreshold) {
                            statement = 'a near identical';
                        } else if (percentageDifference > nearIdenticalThreshold && percentageDifference <= slightlyThreshold) {
                            statement = 'a slightly smaller';
                        } else if (percentageDifference > slightlyThreshold && percentageDifference <= moderatelyThreshold) {
                            statement = 'a moderately smaller';
                        } else if (percentageDifference > moderatelyThreshold && percentageDifference <= massivelyThreshold) {
                            statement = 'a significantly smaller';
                        } else {
                            statement = 'a massively smaller';
                        }
                    }
                    catch(error){
                        //pass
                    }
                    let adulthood_comment;
    
                    try{
                        if(metricData[1][0] == '18-24' || metricData[1][0] == '25-34'){ //If first is young
                            if(metricData[2][0] == '18-24' || metricData[2][0] == '25-34'){//If first 2 are youngest age groups
                                adulthood_comment = 'early adulthood'; 
                        }
                            else if(metricData[2][0] == '35-44' || metricData[2][0] == '45-54'){
                                adulthood_comment = 'early to mid adulthood'; 
                            }
                            else if(metricData[2][0] == '55-64' || metricData[2][0] == '65+'){
                                adulthood_comment = 'early or late adulthood'; 
                            }
                        }
    
                        else if(metricData[2][0] == '35-44' || metricData[2][0] == '45-54'){ //If first is middle age
                            if(metricData[2][0] == '18-24' || metricData[2][0] == '25-34'){//If first 2 are youngest age groups
                                adulthood_comment = 'early to mid adulthood'; 
                            }
                            else if(metricData[2][0] == '35-44' || metricData[2][0] == '45-54'){//If 2nd is middle age group
                                adulthood_comment = 'middle adulthood'; //TODO: not sure if this makes sense
                            }
                            else if(metricData[2][0] == '55-64' || metricData[2][0] == '65+'){
                                adulthood_comment = 'mid to late adulthood'; 
                            }  
                        }
                        else if(metricData[2][0] == '55-64' || metricData[2][0] == '65+'){ 
                            if(metricData[2][0] == '18-24' || metricData[2][0] == '25-34'){
                                adulthood_comment = 'early or late adulthood'; 
                            }
                            else if(metricData[2][0] == '35-44' || metricData[2][0] == '45-54'){
                                adulthood_comment = 'mid to late adulthood'; 
                            }
                            else if(metricData[2][0] == '55-64' || metricData[2][0] == '65+'){
                                adulthood_comment = 'senior years'; 
                            }
                        }
                    }
                    catch{
                        try{
                            if(metricData[1][0] == '18-24' || metricData[1][0] == '25-34'){ //If first is young
                                    adulthood_comment = 'early adulthood'; 
                            }
        
                            else if(metricData[2][0] == '35-44' || metricData[2][0] == '45-54'){ //If first is middle age
                                adulthood_comment = 'middle adulthood'; //TODO: not sure if this makes sense
    
                            }
                            else if(metricData[2][0] == '55-64' || metricData[2][0] == '65+'){ 
                                    adulthood_comment = 'senior years'; 
                            }
                        }
                        catch{
                            console.error('Slight issue in age generation - check logic...')
                        }
                    }
    
                    if(selectedMetricIds.has(10)){//If we also have gender, do nothing (graph wise) as the previous pass has already made both graphs
                        try{
                            await pdfwriting.addContentToPdf(doc, `\nThe age distribution among your audience demonstrates a noticeable skew towards ${age_desc}. Specifically, the age group of *${metricData[1][0]}* years accounts for *${parseFloat(metricData[1][1] / totalNumberOfAgeEntries * 100).toFixed(1)}%* of your visitors, while the *${metricData[2][0]}* year age group represents ${statement} share at *${parseFloat(metricData[2][1] / totalNumberOfAgeEntries * 100).toFixed(1)}%*. This pattern suggests that your offerings may resonate more with individuals in their ${adulthood_comment}.`, fontPath, fontPathBold, textSize, false); 
                            await pdfwriting.addSpace(doc, headerSpaceBelow*2);
                        } catch(error){
                            try{ //if there is only 1 catagory (apart from unknown)
                                await pdfwriting.addContentToPdf(doc, `\nThe age distribution among your audience demonstrates a heavy skew towards ${age_desc}. Specifically, the age group of *${metricData[1][0]}* year olds accounts for *all* of your visitors whom shared their age with google. These findings strongly suggest that your offerings resonate more with individuals in their *${adulthood_comment}*.`, fontPath, fontPathBold, textSize, false); 
                                await pdfwriting.addSpace(doc, headerSpaceBelow*2);
                            }
                            catch(error){
                                console.error('No Age groups to report on, apart from possibly "unknown" - shouldnt run');
                            }
                        }
                     } 
                     else{
                        metricData = parseTableData(metricData, metricLabelCapital, 'Amount') //Gets removed right away in the table create func, but may be used later if we change to use table for example
                        await pdfwriting.addContentToPdf(doc, 'The age ranges of your website visitors are illustrated below:\n', fontPath, fontPathBold, textSize, false); 
                        await pdfwriting.addSpace(doc, headerSpaceBelow);
                        await pdfwriting.addSpace(doc, headerSpaceBelow + ((textSize/headerSize))); //counteract the line spacing so it is an even gap
                        await addAutoChartType(doc, metricData, metricLabelCapital)
        
                        await pdfwriting.addSpace(doc, headerSpaceBelow);
                        await pdfwriting.addContentToPdf(doc, `test`, fontPath, fontPathBold, textSize, false); 
                        await pdfwriting.addSpace(doc, headerSpaceBelow);
                        await pdfwriting.addSpace(doc, headerSpaceBelow);
                     }
                }
    
                else if(metricName == 'language'){
                    metricData = parseTableData(metricData, metricLabelCapital, 'Amount') //Gets removed right away in the table create func, but may be used later if we change to use table for example
                    if (metricData.length - 1 > 1){
                        await pdfwriting.addContentToPdf(doc, `The top *${await numberToWord(metricData.length - 1)}* most common languages were as follows:\n`, fontPath, fontPathBold, textSize, false); 
                        try{
                            let connective = '';
                            if (metricData[1][1] == metricData[2][1]){
                                connective = ' also'
                            }
                            let secondLanguageDescription = metricData[2][0];
                            if (secondLanguageDescription === 'Other') {
                                secondLanguageDescription = 'an amalgamation of *other smaller languages*';
                            }
        
                            data_length = metricData.length - 1;
                            await pdfwriting.addSpace(doc, headerSpaceBelow + ((textSize/headerSize))); //counteract the line spacing so it is an even gap
                            await pdfwriting.generateGraphAndEmbed(doc, metricData, 'Languages', space_before = 16, text_size = 20, max_data_size = 6) //6 means 5 points as header
                            await pdfwriting.addSpace(doc, headerSpaceBelow);
                            await pdfwriting.addContentToPdf(
                                doc, 
                                `The most common language used when accessing your site was *${metricData[1][0]}* at *${numberWithCommas(metricData[1][1])}* visitors, followed by ${secondLanguageDescription !== 'an amalgamation of *other smaller languages*' ? '*' + secondLanguageDescription + '*' : secondLanguageDescription}${connective} at *${numberWithCommas(metricData[2][1])}* visitors.`, 
                                fontPath, 
                                fontPathBold, 
                                textSize, 
                                false
                            );
                        }
                        
                        catch(err){
                            console.error('Error: Langauge section: ', err)
                        }}
                            
                    try{
                        let errorCatch = metricData[2][0];
                    }catch{
                        try{
                            if (data_length > 0){
                                await pdfwriting.addContentToPdf(
                                    doc, 
                                    `The *only language* used when accessing your site was *${metricData[1][0]}* at *${numberWithCommas(metricData[1][1])}* visitors.`,
                                    fontPath, 
                                    fontPathBold, 
                                    textSize, 
                                    false
                                ); 
                            }
                            else{
                                await pdfwriting.addContentToPdf(
                                    doc, 
                                    `We had some trouble finding your language data. *Please contact support* and we will be happy to help.`,
                                    fontPath, 
                                    fontPathBold, 
                                    textSize, 
                                    false);
                                }
                            }catch {
                                await pdfwriting.addContentToPdf(
                                    doc, 
                                    `We had some trouble finding your language data. *Please contact support* and we will be happy to help.`,
                                    fontPath, 
                                    fontPathBold, 
                                    textSize, 
                                    false);
                                }
                            }
                        }
                    }
                }
        pdfwriting.addSpace(doc, endOfSegmentSpace);
        if(spaceCalcMode == true){
            endPos = await pdfwriting.finalisePdf(doc, true);
            heightDiff = endPos - startPos;
            return heightDiff
        }
        return
    } catch{
        console.error('There was an error with the demographic function, not adding to the report')
    }

}

async function usersByDeviceFunc(doc, spaceCalcMode = false) {
    try{
        await spaceCalcMessage(doc, spaceCalcMode, 'users_by_device')

        startPos = await pdfwriting.getMarginTop(); 
    
        needData = await databaseFuncs.getChosenValueAsBoolean('device_usage') //See if the user wants the only metric for this segment (I imagine this will be locked in the front end UI so it always says yes, but just incase)
    
        if (needData == true){
            referral_data = await databaseFuncs.getMetricDataByName('device_usage');
        }
    
        let data = parseTableData(referral_data, 'Browser', 'Amount'); 
    
        //Adding to PDF
            await pdfwriting.addContentToPdf(doc, `*User Devices*\n`, fontPath, fontPathBold, headerSize, false); 
            await pdfwriting.addSpace(doc, headerSpaceBelow);
            await pdfwriting.addContentToPdf(doc, `Visitors used the following devices to access your site:\n`, fontPath, fontPathBold, textSize, false); 
            await pdfwriting.addSpace(doc, headerSpaceBelow + ((headerSize - textSize)/2)); //counteract the line spacing so it is an even gap
    
            //await pdfwriting.generateTableAndEmbed(doc, data, false);
            await addAutoChartType(doc, data, 'Device')
            // Check if the data exists and is in the expected format
                if (!data || !Array.isArray(data) || data.length < 3 || !Array.isArray(data[1]) || !Array.isArray(data[2]) || data[1].length < 2 || data[2].length < 2) {
                    throw new Error('Data is missing or not in the expected format.');
                }
            
            // If the checks pass, proceed with adding content to the PDF
            await pdfwriting.addSpace(doc, headerSpaceBelow);
            text = `The most popular device used to access your site was *${data[1][0].toLowerCase() === 'mobile' ? '*a *Mobile phone' : '*a *' + data[1][0]}*, with *${numberWithCommas(data[1][1])}* ${data[1][1] == 1 ? 'session' : 'sessions'}. This was followed by *${data[2][0].toLowerCase() === 'mobile' ? (data[2][1] == 1 ? '*a *Mobile phone' : 'Mobile phones') : (data[2][1] == 1 ? '*a* ' + data[2][0] : data[2][0] + "s")}* at *${numberWithCommas(data[2][1])}* ${data[2][1] == 1 ? 'session' : 'sessions'} and *${data[3][0].toLowerCase() === 'mobile' ? (data[3][1] == 1 ? '*a *Mobile phone' : 'Mobile phones') : (data[3][1] == 1 ? '*a* ' + data[3][0] : data[3][0] + "s")}* at *${numberWithCommas(data[3][1])}* ${data[3][1] == 1 ? 'session' : 'sessions'}.`;
            await pdfwriting.addContentToPdf(doc, text, fontPath, fontPathBold, textSize, false);
            await pdfwriting.addSpace(doc, endOfSegmentSpace);
        //Adding to PDF
    
        if(spaceCalcMode == true){
            endPos = await pdfwriting.finalisePdf(doc, true);
            heightDiff = endPos - startPos;
            return heightDiff
        }
        return
    } catch{
        console.error('There was an error with the device function, not adding to the report')
    }

}

async function usersByBrowserFunc(doc, spaceCalcMode = false) {
    try{
        await spaceCalcMessage(doc, spaceCalcMode, 'users_by_browser')
        startPos = await pdfwriting.getMarginTop(); 
        needData = await databaseFuncs.getChosenValueAsBoolean('browser_usage') //See if the user wants the only metric for this segment (I imagine this will be locked in the front end UI so it always says yes, but just incase)
    
        if (needData == true){
            referral_data = await databaseFuncs.getMetricDataByName('browser_usage');
        }
    
        let data = parseTableData(referral_data, 'Device', 'Amount'); 
    
        //Adding to PDF
            await pdfwriting.addContentToPdf(doc, `*Users Browser Choice*\n`, fontPath, fontPathBold, headerSize, false); 
            await pdfwriting.addSpace(doc, headerSpaceBelow);
            await pdfwriting.addContentToPdf(doc, `Visitors used the following browsers to access your site:`, fontPath, fontPathBold, textSize, false); 
            await pdfwriting.addSpace(doc, headerSpaceBelow + ((headerSize - textSize)/2)); //counteract the line spacing so it is an even gap
    
            //await pdfwriting.generateTableAndEmbed(doc, data, false);
            await addAutoChartType(doc, data, 'Browser')
    
            // Check if the data exists and is in the expected format
                if (!data || !Array.isArray(data) || data.length < 3 || !Array.isArray(data[1]) || !Array.isArray(data[2]) || data[1].length < 2 || data[2].length < 2) {
                    throw new Error('Data is missing or not in the expected format.');
                }
            // If the checks pass, proceed with adding content to the PDF
            await pdfwriting.addSpace(doc, headerSpaceBelow);
            text = `The most common browser was *${data[1][0]}* at *${numberWithCommas(data[1][1])}* ${data[1][1] == 1 ? 'session' : 'sessions'}, with the use of *${data[2][0]}* at *${numberWithCommas(data[2][1])}* ${data[2][1] == 1 ? 'session' : 'sessions'}, followed by *${data[3][0]}* at *${numberWithCommas(data[3][1])}* ${data[3][1] == 1 ? 'session' : 'sessions'}.`;
            await pdfwriting.addContentToPdf(doc, text, fontPath, fontPathBold, textSize, false);
            await pdfwriting.addSpace(doc, endOfSegmentSpace);
        //Adding to PDF
    
        if(spaceCalcMode == true){
            endPos = await pdfwriting.finalisePdf(doc, true);
            heightDiff = endPos - startPos;
            return heightDiff
        }
        return
    } catch{
        console.error('There was an error with the browser function, not adding to the report')
    }
}

async function engagementFunc(doc, metricResults, spaceCalcMode = false) {
    try{
        await spaceCalcMessage(doc, spaceCalcMode, 'engagement')
        startPos = await pdfwriting.getMarginTop(); 
        const selectedMetricIds = new Set(metricResults.map(metric => metric.metric_id));
        const metrics = [
            'bounce_rate',       // metric_id 13
            'scroll_depth'     // metric_id 14
        ];
        await pdfwriting.addContentToPdf(doc, `*User Engagement*\n`, fontPath, fontPathBold, headerSize, false); 
        await pdfwriting.addSpace(doc, headerSpaceBelow);
    
        for (let i = 12; i < metrics.length + 12; i++) {
            const metricName = metrics[i-12];
            const metricId = i + 1; 
            if (selectedMetricIds.has(metricId)) { //Gets each metric_ID IF chosen
                let metricData = await databaseFuncs.getMetricDataByName(metricName); //Get metric name
    
                if(metricName == 'bounce_rate'){
                    metricData = parseTableData(metricData, 'Origin', 'Bounce Rate'); //set to preserve the decimals
                    metricDataLength = metricData.length - 1;   
    
                    if(selectedMetricIds.has(14)){ //if we have scroll as well
                        let metricDataScroll = await databaseFuncs.getMetricDataByName('scroll_depth'); //Get metric name
                        metricDataScroll = parseTableData(metricDataScroll, 'Origin', 'Scroll Rate'); //set to preserve the decimals
                        metricDataScrollLength = metricDataScroll.length - 1;   
                        await pdfwriting.addContentToPdf(doc, `User referral *Bounce rates* and *Scroll depth* were as follows:`, fontPath, fontPathBold);
                        await pdfwriting.addSpace(doc, headerSpaceBelow + ((headerSize - textSize)/2)); 
                        await pdfwriting.generateDualPieChartsAndEmbed(doc, metricData, metricDataScroll);
                        await pdfwriting.addSpace(doc, headerSpaceBelow + ((headerSize - textSize)/2)); 
    
                    } 
    
                    else{ //if JUST bounce_rate present
                        await pdfwriting.addContentToPdf(doc, `User referral *Bounce rates* were as follows:`, fontPath, fontPathBold);
                        await pdfwriting.addSpace(doc, headerSpaceBelow + ((headerSize - textSize)/2)); 
                        await pdfwriting.generatePieChartAndEmbed(doc, metricData);
                        await pdfwriting.addSpace(doc, headerSpaceBelow + ((headerSize - textSize)/2)); 
                    }
    
                    let origin1;
                    let origin2;
                    let origin3;
    
                    if(true){ //used to hide all the if statments
                        try{
                            //For the 1st referral
                            if(metricData[1][0] == 'Direct'){
                                origin1 = 'visitors who *arrived directly*';
                            }
                            else if (metricData[1][0] == 'Organic'){
                                origin1 = 'visitors who *arrived organically*';
                            }
                            else if (metricData[1][0] == 'Social'){
                                origin1 = 'visitors who arrived *via social media*';
                            }
                            else if (metricData[1][0] == 'Referral'){
                                origin1 = 'visitors who were *referred via an external link*';
                            }
                            else if (metricData[1][0] == 'Display'){
                                origin1 = 'visitors who arrived via an *advertisement*';
                            }
                            else if (metricData[1][0] == 'Paid' || metricData[1][0] == 'Paid Search' || metricData[1][0] == 'Paid search' ){
                                origin1 = 'visitors who arrived via a *paid search*';
                            }
                            else if (metricData[1][0] == 'Email'){
                                origin1 = 'visitors who arrived via an *email*';
                            }
                            else if (metricData[1][0] == 'Affiliate'){
                                origin1 = 'visitors who arrived via an *affiliate link*';
                            }
                            else if (metricData[1][0] == 'Other'){
                                origin1 = 'visitors who arrived via *unknown methods*';
                            }
                        } catch{
                            console.error('No data for referral bounce rate found...')
                            await pdfwriting.addContentToPdf(doc, 'There was no available referral bounce rate data.')
                        }
    
                        try{
                            //For the 2nd referral
                            if(metricData[2][0] == 'Direct'){
                                origin2 = 'visitors who *arrived directly*';
                            }
                            else if (metricData[2][0] == 'Organic'){
                                origin2 = 'visitors who *arrived organically*';
                            }
                            else if (metricData[2][0] == 'Social'){
                                origin2 = 'visitors who arrived *via social media*';
                            }
                            else if (metricData[2][0] == 'Referral'){
                                origin2 = 'visitors who were *referred via an external link*';
                            }
                            else if (metricData[2][0] == 'Display'){
                                origin2 = 'visitors who arrived via an *advertisement*';
                            }
                            else if (metricData[2][0] == 'Paid' || metricData[2][0] == 'Paid Search' || metricData[2][0] == 'Paid search' ){
                                origin2 = 'visitors who arrived via a *paid search*';
                            }
                            else if (metricData[2][0] == 'Email'){
                                origin2 = 'visitors who arrived via an *email*';
                            }
                            else if (metricData[2][0] == 'Affiliate'){
                                origin2 = 'visitors who arrived via an *affiliate link*';
                            }
                            else if (metricData[2][0] == 'Other'){
                                origin2 = 'visitors who arrived via *unknown methods*';
                            }
                        }catch{ //If therefore only 1 type of referral bounce rate
                            await pdfwriting.addContentToPdf(doc, `A 'Bounce rate' is the percentage of visitors that leave a webpage without taking an action. Typically, a lower bounce rate is more favourable. As evident from above, you only have *one recorded referral source*. This means ${origin1} were the only recorded source of entry, carrying a *${metricData[1][1]}% bounce rate*.`, fontPath, fontPathBold);    
                        }
    
                        if(metricDataLength > 2){
                            //for 3rd referral
                            if(metricData[metricDataLength][0] == 'Direct'){
                                origin3 = 'visitors who *arrived directly*';
                            }
                            else if (metricData[metricDataLength][0] == 'Organic'){
                                origin3 = 'visitors who *arrived organically*';
                            }
                            else if (metricData[metricDataLength][0] == 'Social'){
                                origin3 = 'visitors who arrived *via social media*';
                            }
                            else if (metricData[metricDataLength][0] == 'Referral'){
                                origin3 = 'visitors who were *referred via an external link*';
                            }
                            else if (metricData[metricDataLength][0] == 'Display'){
                                origin3 = 'visitors who arrived via an *advertisement*';
                            }
                            else if (metricData[metricDataLength][0] == 'Paid' || metricData[metricDataLength][0] == 'Paid Search' || metricData[metricDataLength][0] == 'Paid search' ){
                                origin3 = 'visitors who arrived via a *paid search*';
                            }
                            else if (metricData[metricDataLength][0] == 'Email'){
                                origin3 = 'visitors who arrived via an *email*';
                            }
                            else if (metricData[metricDataLength][0] == 'Affiliate'){
                                origin3 = 'visitors who arrived via an *affiliate link*';
                            }
                            else if (metricData[metricDataLength][0] == 'Other'){
                                origin3 = 'visitors who arrived via *unknown methods*';
                            }
                            await pdfwriting.addContentToPdf(doc, `A 'Bounce rate' is the percentage of visitors that leave a webpage without taking an action. Typically, a lower bounce rate is more favourable. As shown above, ${origin1} had the highest bounce rate at *${metricData[1][1]}%*, followed by ${origin2} with a bounce rate of *${metricData[2][1]}%*. The ${origin3} were the most explorative, carrying a bounce rate of *${metricData[metricDataLength][1]}%*.`, fontPath, fontPathBold);    
                        } else if(metricDataLength > 1){
                            await pdfwriting.addContentToPdf(doc, `Upon analysing the data, it becomes evident that there are two primary sources of traffic. The ${origin1} showed the highest bounce rate at *${metricData[1][1]}%*. Meanwhile, ${origin2} recorded a bounce rate of *${metricData[2][1]}%*.`, fontPath, fontPathBold);    
                        }
                    }
    
                    if(selectedMetricIds.has(14)){ //if we have scroll as well (again because this has to go AFTER the first paragraph)
                        if(true){ //used to hide all the if statments
                            let metricDataScroll = await databaseFuncs.getMetricDataByName('scroll_depth'); //Get metric name
                            metricDataScroll = parseTableData(metricDataScroll, 'Origin', 'Scroll Rate'); //set to preserve the decimals
                            metricDataScrollLength = metricDataScroll.length - 1;   
                            try{
                                //For the 1st referral
                                if(metricDataScroll[1][0] == 'Direct'){
                                    origin1 = 'visitors who *arrived directly*';
                                }
                                else if (metricDataScroll[1][0] == 'Organic'){
                                    origin1 = 'visitors who *arrived organically*';
                                }
                                else if (metricDataScroll[1][0] == 'Social'){
                                    origin1 = 'visitors who arrived *via social media*';
                                }
                                else if (metricDataScroll[1][0] == 'Referral'){
                                    origin1 = 'visitors who were *referred via an external link*';
                                }
                                else if (metricDataScroll[1][0] == 'Display'){
                                    origin1 = 'visitors who arrived via an *advertisement*';
                                }
                                else if (metricDataScroll[1][0] == 'Paid' || metricDataScroll[1][0] == 'Paid Search' || metricDataScroll[1][0] == 'Paid search' ){
                                    origin1 = 'visitors who arrived via a *paid search*';
                                }
                                else if (metricDataScroll[1][0] == 'Email'){
                                    origin1 = 'visitors who arrived via an *email*';
                                }
                                else if (metricDataScroll[1][0] == 'Affiliate'){
                                    origin1 = 'visitors who arrived via an *affiliate link*';
                                }
                                else if (metricDataScroll[1][0] == 'Other'){
                                    origin1 = 'visitors who arrived via *unknown methods*';
                                }
                            } catch{
                                console.error('No data for scroll depth found...')
                                await pdfwriting.addSpace(doc, headerSpaceBelow);
                                await pdfwriting.addContentToPdf(doc, 'There was no available scroll depth data.')
                            }
        
                            try{
                                //For the 2nd referral
                                if(metricDataScroll[2][0] == 'Direct'){
                                    origin2 = 'visitors who *arrived directly*';
                                }
                                else if (metricDataScroll[2][0] == 'Organic'){
                                    origin2 = 'visitors who *arrived organically*';
                                }
                                else if (metricDataScroll[2][0] == 'Social'){
                                    origin2 = 'visitors who arrived *via social media*';
                                }
                                else if (metricDataScroll[2][0] == 'Referral'){
                                    origin2 = 'visitors who were *referred via an external link*';
                                }
                                else if (metricDataScroll[2][0] == 'Display'){
                                    origin2 = 'visitors who arrived via an *advertisement*';
                                }
                                else if (metricDataScroll[2][0] == 'Paid' || metricDataScroll[2][0] == 'Paid Search' || metricDataScroll[2][0] == 'Paid search' ){
                                    origin2 = 'visitors who arrived via a *paid search*';
                                }
                                else if (metricDataScroll[2][0] == 'Email'){
                                    origin2 = 'visitors who arrived via an *email*';
                                }
                                else if (metricDataScroll[2][0] == 'Affiliate'){
                                    origin2 = 'visitors who arrived via an *affiliate link*';
                                }
                                else if (metricDataScroll[2][0] == 'Other'){
                                    origin2 = 'visitors who arrived via *unknown methods*';
                                }
                            }catch{ //If therefore only 1 type of referral bounce rate
                                await pdfwriting.addSpace(doc, headerSpaceBelow);
                                await pdfwriting.addContentToPdf(doc, `After further analysis, we found ${origin1} had a *scroll depth of ${metricDataScroll[1][1]}%*.`, fontPath, fontPathBold);    
                            }
        
                            if(metricDataScrollLength > 2){
                                //for 3rd referral
                                if(metricDataScroll[metricDataScrollLength][0] == 'Direct'){
                                    origin3 = 'visitors who *arrived directly*';
                                }
                                else if (metricDataScroll[metricDataScrollLength][0] == 'Organic'){
                                    origin3 = 'visitors who *arrived organically*';
                                }
                                else if (metricDataScroll[metricDataScrollLength][0] == 'Social'){
                                    origin3 = 'visitors who arrived *via social media*';
                                }
                                else if (metricDataScroll[metricDataScrollLength][0] == 'Referral'){
                                    origin3 = 'visitors who were *referred via an external link*';
                                }
                                else if (metricDataScroll[metricDataScrollLength][0] == 'Display'){
                                    origin3 = 'visitors who arrived via an *advertisement*';
                                }
                                else if (metricDataScroll[metricDataScrollLength][0] == 'Paid' || metricDataScroll[metricDataScrollLength][0] == 'Paid Search' || metricDataScroll[metricDataScrollLength][0] == 'Paid search' ){
                                    origin3 = 'visitors who arrived via a *paid search*';
                                }
                                else if (metricDataScroll[metricDataScrollLength][0] == 'Email'){
                                    origin3 = 'visitors who arrived via an *email*';
                                }
                                else if (metricDataScroll[metricDataScrollLength][0] == 'Affiliate'){
                                    origin3 = 'visitors who arrived via an *affiliate link*';
                                }
                                else if (metricDataScroll[metricDataScrollLength][0] == 'Other'){
                                    origin3 = 'visitors who arrived via *unknown methods*';
                                }
                                await pdfwriting.addSpace(doc, headerSpaceBelow);
                                await pdfwriting.addContentToPdf(doc, `Next, we analysed the *Scroll depth*. This is the percentage of visitors that scroll more than 90% of the webpage. As shown above on the right pi chart, ${origin1} had the highest scroll depth at *${metricDataScroll[1][1]}%*, followed by ${origin2} with a scroll depth of *${metricDataScroll[2][1]}%*. The ${origin3} were the least interested, with a scroll rate of *${metricDataScroll[metricDataScrollLength][1]}%*.`, fontPath, fontPathBold);    
                            }
                            //if 2 sources of referral
                            else if(metricDataScrollLength > 1){
                                await pdfwriting.addSpace(doc, headerSpaceBelow);
                                await pdfwriting.addContentToPdf(doc, `The ${origin1} showed the largest scroll depth at *${metricDataScroll[1][1]}%*. Meanwhile, ${origin2} reported a scroll rate of *${metricDataScroll[2][1]}%*.`, fontPath, fontPathBold);    
                            }
                        }
                    }
                }
    
                if(metricName == 'scroll_depth'){ //if we have scroll as well (again because this has to go AFTER the first paragraph)
                    if(selectedMetricIds.has(13)){
                    //Do nothing as already spoken for above ^
                    }
                    else{
                        let metricDataScroll = await databaseFuncs.getMetricDataByName('scroll_depth'); //Get metric name
                        metricDataScroll = parseTableData(metricDataScroll, 'Origin', 'Scroll Rate'); //set to preserve the decimals
                        metricDataScrollLength = metricDataScroll.length - 1;   
        
                        await pdfwriting.addContentToPdf(doc, `Users *Scroll depth* was as follows:`, fontPath, fontPathBold);
                        await pdfwriting.addSpace(doc, headerSpaceBelow);
                        await pdfwriting.generatePieChartAndEmbed(doc, metricDataScroll);
                        await pdfwriting.addSpace(doc, headerSpaceBelow + ((headerSize - textSize)/2)); 
                        
                        if(true){ //used to hide all the if statments
        
                            try{
                                //For the 1st referral
                                if(metricDataScroll[1][0] == 'Direct'){
                                    origin1 = 'visitors who *arrived directly*';
                                }
                                else if (metricDataScroll[1][0] == 'Organic'){
                                    origin1 = 'visitors who *arrived organically*';
                                }
                                else if (metricDataScroll[1][0] == 'Social'){
                                    origin1 = 'visitors who arrived *via social media*';
                                }
                                else if (metricDataScroll[1][0] == 'Referral'){
                                    origin1 = 'visitors who were *referred via an external link*';
                                }
                                else if (metricDataScroll[1][0] == 'Display'){
                                    origin1 = 'visitors who arrived via an *advertisement*';
                                }
                                else if (metricDataScroll[1][0] == 'Paid' || metricDataScroll[1][0] == 'Paid Search' || metricDataScroll[1][0] == 'Paid search' ){
                                    origin1 = 'visitors who arrived via a *paid search*';
                                }
                                else if (metricDataScroll[1][0] == 'Email'){
                                    origin1 = 'visitors who arrived via an *email*';
                                }
                                else if (metricDataScroll[1][0] == 'Affiliate'){
                                    origin1 = 'visitors who arrived via an *affiliate link*';
                                }
                                else if (metricDataScroll[1][0] == 'Other'){
                                    origin1 = 'visitors who arrived via *unknown methods*';
                                }
                            } catch{
                                console.error('No data for scroll depth found...')
                                await pdfwriting.addSpace(doc, headerSpaceBelow);
                                await pdfwriting.addContentToPdf(doc, 'There was no available scroll depth data.')
                            }
        
                            try{
                                //For the 2nd referral
                                if(metricDataScroll[2][0] == 'Direct'){
                                    origin2 = 'visitors who *arrived directly*';
                                }
                                else if (metricDataScroll[2][0] == 'Organic'){
                                    origin2 = 'visitors who *arrived organically*';
                                }
                                else if (metricDataScroll[2][0] == 'Social'){
                                    origin2 = 'visitors who arrived *via social media*';
                                }
                                else if (metricDataScroll[2][0] == 'Referral'){
                                    origin2 = 'visitors who were *referred via an external link*';
                                }
                                else if (metricDataScroll[2][0] == 'Display'){
                                    origin2 = 'visitors who arrived via an *advertisement*';
                                }
                                else if (metricDataScroll[2][0] == 'Paid' || metricDataScroll[2][0] == 'Paid Search' || metricDataScroll[2][0] == 'Paid search' ){
                                    origin2 = 'visitors who arrived via a *paid search*';
                                }
                                else if (metricDataScroll[2][0] == 'Email'){
                                    origin2 = 'visitors who arrived via an *email*';
                                }
                                else if (metricDataScroll[2][0] == 'Affiliate'){
                                    origin2 = 'visitors who arrived via an *affiliate link*';
                                }
                                else if (metricDataScroll[2][0] == 'Other'){
                                    origin2 = 'visitors who arrived via *unknown methods*';
                                }
                            }catch{ //If therefore only 1 type of referral bounce rate
                                await pdfwriting.addSpace(doc, headerSpaceBelow);
                                await pdfwriting.addContentToPdf(doc, `Your website only had one source of referral, ${origin1}. These visitors a *scroll depth of ${metricDataScroll[1][1]}%* on average.`, fontPath, fontPathBold);    
                            }
        
                            if(metricDataScrollLength > 2){
                                //for 3rd referral
                                if(metricDataScroll[metricDataScrollLength][0] == 'Direct'){
                                    origin3 = 'visitors who *arrived directly*';
                                }
                                else if (metricDataScroll[metricDataScrollLength][0] == 'Organic'){
                                    origin3 = 'visitors who *arrived organically*';
                                }
                                else if (metricDataScroll[metricDataScrollLength][0] == 'Social'){
                                    origin3 = 'visitors who arrived *via social media*';
                                }
                                else if (metricDataScroll[metricDataScrollLength][0] == 'Referral'){
                                    origin3 = 'visitors who were *referred via an external link*';
                                }
                                else if (metricDataScroll[metricDataScrollLength][0] == 'Display'){
                                    origin3 = 'visitors who arrived via an *advertisement*';
                                }
                                else if (metricDataScroll[metricDataScrollLength][0] == 'Paid' || metricDataScroll[metricDataScrollLength][0] == 'Paid Search' || metricDataScroll[metricDataScrollLength][0] == 'Paid search' ){
                                    origin3 = 'visitors who arrived via a *paid search*';
                                }
                                else if (metricDataScroll[metricDataScrollLength][0] == 'Email'){
                                    origin3 = 'visitors who arrived via an *email*';
                                }
                                else if (metricDataScroll[metricDataScrollLength][0] == 'Affiliate'){
                                    origin3 = 'visitors who arrived via an *affiliate link*';
                                }
                                else if (metricDataScroll[metricDataScrollLength][0] == 'Other'){
                                    origin3 = 'visitors who arrived via *unknown methods*';
                                }
                                await pdfwriting.addSpace(doc, headerSpaceBelow);
                                await pdfwriting.addContentToPdf(doc, `After analysing the *Scroll depth*, we found ${origin1} had the highest scroll depth at *${metricDataScroll[1][1]}%*, followed by ${origin2} with a scroll depth of *${metricDataScroll[2][1]}%*. The ${origin3} were the least interested, with a scroll rate of *${metricDataScroll[metricDataScrollLength][1]}%*.`, fontPath, fontPathBold);    
                            }
                            //if 2 sources of referral
                            else if(metricDataScrollLength > 1){
                                await pdfwriting.addSpace(doc, headerSpaceBelow);
                                await pdfwriting.addContentToPdf(doc, `The ${origin1} showed the largest scroll depth at *${metricDataScroll[1][1]}%*. Meanwhile, ${origin2} reported a scroll rate of *${metricDataScroll[2][1]}%*.`, fontPath, fontPathBold);    
                            }
                        }
                    }
                    
                }
            }
        }
    
        pdfwriting.addSpace(doc, endOfSegmentSpace);
        if(spaceCalcMode == true){
            endPos = await pdfwriting.finalisePdf(doc, true);
            heightDiff = endPos - startPos;
            return heightDiff
        }
    } catch{
        console.error('There was an error with the engagement function, not adding to the report')
    }
}

async function searchEnginePositionsFunc(doc, clientID, clientFile) {
    console.log('Running Search Engine Positions Function');
}

async function googleAdsFunc(doc, clientID, clientFile) {
    console.log('Running Google Ads Function');
}

async function bingAdsFunc(doc, clientID, clientFile) {
    console.log('Running Bing Ads Function');
}

async function conversionsFunc(doc, clientID, clientFile) {
    console.log('Running Conversions Function');
}

async function conversionReferralDataFunc(doc, clientID, clientFile) {
    console.log('Running Conversion Referral Data Function');
}

async function landingPagesFunc(doc, clientID, clientFile) {
    console.log('Running Landing Pages Function');
}

async function insightsFunc(doc, clientID, clientFile) {
    console.log('Running Insights Function');
}

async function summaryFunc(doc, spaceCalcMode = false) {
    try{
        await spaceCalcMessage(doc, spaceCalcMode, 'summary')
        startPos = await pdfwriting.getMarginTop(); 
        summary_data = await databaseFuncs.getMetricDataByName('summary_content');

        //Pdf writing
        await pdfwriting.addContentToPdf(doc, `*Summary*\n`, fontPath, fontPathBold, headerSize, false); 
        await pdfwriting.addSpace(doc, headerSpaceBelow)
        await pdfwriting.addContentToPdf(doc, summary_data, fontPath, fontPathBold, textSize, false);
        pdfwriting.addSpace(doc, endOfSegmentSpace);
    
        if(spaceCalcMode == true){
            endPos = await pdfwriting.finalisePdf(doc, true);
            heightDiff = endPos - startPos;
            return heightDiff
        }
        return
    } catch{
        console.error('There was an error with the summary function, not adding to the report')
    }
}

async function comparisonFunc(doc, spaceCalcMode = false) {
    try{
        await spaceCalcMessage(doc, spaceCalcMode, 'comparison')
        startPos = await pdfwriting.getMarginTop(); 
    
        comparison_dates = await databaseFuncs.getMetricDataByName('start_and_end_dates');
        
        const { startDate, endDate } = splitDates(comparison_dates); //Example format for DB: 2023-01-01, 2023-02-01
        const dateRange = await fetchAndFormatDateRange(1, true, startDate, endDate); 
        const dateRange2 = await fetchAndFormatDateRange(1);
    
    
        await pdfwriting.addContentToPdf(doc, `*Comparisons*\n`, fontPath, fontPathBold, headerSize, false); 
        await pdfwriting.addSpace(doc, 5);
        await pdfwriting.addContentToPdf(doc, `Building upon the analysis of the *${dateRange2}*, we extended our comparison to the *${dateRange}* below:\n`, fontPath, fontPathBold, textSize, false); 
        await pdfwriting.addSpace(doc, headerSpaceBelow);
    
        async function prepareCompData() {  //Prepares the new comp data
            const reports = await fetch_clientID_clientFile(); //Gets the needed clientID and clientFile
    
            if (reports && reports.length > 0) {
                for (const report of reports) {
                    
                    await compareNewOldData({
                        clientID: report.clientID,
                        clientFile: report.clientFile
                    });
                }
            } else {
                console.log('Failed to prepare comparison data');
            }
        }
    
        const compareNewOldData = async ({clientID, clientFile}) => { // Save each needed metrics to their own variable
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
    
                compData = await fetchCompData(flatMetricIds, clientID, clientFile, startDate, endDate); //Get all the data in chosen comparison period        
                
                let outputString = "";
                let spaceCounter = 0; //Tracks the amount of items added to the outputString
    
                async function spaceChecker(n = 3){
                
                if (spaceCounter > 2){ //If it's the third addition to the list, or greater
                    await pdfwriting.addSpace(doc, 5);
                    await pdfwriting.addContentToPdf(doc, outputString, fontPath, fontPathBold, textSize, false);
                    outputString = "";
                    spaceCounter = 0
                }
    
                }
                for (let i = 0; i < compData.length; i++) {
                    let compDataID = compData[i][0];
                    let compDataData = compData[i][1];
                    let databaseData = await databaseFuncs.getMetricDataById(compDataID);
                    await spaceChecker();
    
                    if (compData[i][0] == 1) { //visitors
                        try{
                            outputString += `In the comparison period we saw *${numberWithCommas(compDataData)}* ${compDataData === 1 ? 'visitor' : 'visitors'}, which compares to the *${numberWithCommas(databaseData)}* ${databaseData === 1 ? 'visitor' : 'visitors'} previously recorded in this report. `;
                            spaceCounter += 1
                        } catch{
                            //Pass
                        }
    
    
                    } else if (compData[i][0] == 2) { //Total page views
                        try{
                            outputString += `We measured *${numberWithCommas(compDataData)}* ${compDataData === 1 ? 'page view' : 'page views'}, compared to the *${numberWithCommas(databaseData)}* ${databaseData === 1 ? 'page view' : 'page views'} previously measured. `;
                            spaceCounter += 1
                        } catch{
                            //Pass
                        }
    
    
                    } else if (compData[i][0] == 3) { //Pages viewed
                        try{
                            function extractItemOrValue(inputString, getItem = true, itemIndex = 1, excludePipe = true) {
                                // Assuming the first two elements are headings and thus skipping them
                                // Adjust the index to account for these headings
                                const adjustedIndex = (itemIndex - 1) * 2 + 2;
                            
                                // Split the input string into an array using double commas, trimming whitespace
                                const elements = inputString.split(',,').map(element => element.trim());
                            
                                // Check if the adjustedIndex is within the bounds of the array, excluding headings
                                if (adjustedIndex < 2 || adjustedIndex >= elements.length) {
                                    return ''; // Return an empty string if out of bounds
                                }
                            
                                let selectedElement;
                                if (getItem) {
                                    // Return the item name
                                    selectedElement = elements[adjustedIndex];
                                } else {
                                    // Return the item's value (next element in the array)
                                    selectedElement = elements.length > adjustedIndex + 1 ? elements[adjustedIndex + 1] : '';
                                }
                            
                                // If excludePipe is true, check for the presence of a pipe symbol and exclude it and anything after it
                                if (excludePipe && selectedElement.includes('|')) {
                                    // Find the index of the pipe symbol
                                    const pipeIndex = selectedElement.indexOf('|');
                                    // Return the substring up to (but not including) the pipe symbol
                                    return selectedElement.substring(0, pipeIndex).trim();
                                }
                            
                                // Return the selected element as is if there's no pipe or if excludePipe is false
                                return selectedElement;
                            }
                             
                            // Iterating over the comparison data to generate a detailed comparison report
                            const pageName1 = extractItemOrValue(compDataData, true, 1);
                            const pageName2 = extractItemOrValue(compDataData, true, 2);
                            const percentTotalViews1 = extractItemOrValue(compDataData, false, 1);
                            const percentTotalViews2 = extractItemOrValue(compDataData, false, 2);
        
                            const pageName1DB = extractItemOrValue(databaseData, true, 1);
                            const pageName2DB = extractItemOrValue(databaseData, true, 2);
                            const percentTotalViews1DB = extractItemOrValue(databaseData, false, 1);
                            const percentTotalViews2DB = extractItemOrValue(databaseData, false, 2);
                            
                            if (pageName1 == pageName1DB & pageName2 == pageName2DB){
                                outputString += `'*${pageName1}*' was the most visited page at *${percentTotalViews1}* of total views. Contrasting with *${percentTotalViews1DB}* of page views previously highlighted. `;
                                outputString += `Next, the second most viewed page was '*${pageName2}*' which had *${percentTotalViews2}* of total page views, differing from the *${percentTotalViews2DB}* cited earlier. `;
                            }
        
                            else if(pageName1 == pageName1DB){
                                outputString += `In the comparison period, '*${pageName1}*' was the most visited page at *${percentTotalViews1}* of total views. This compares to the *${percentTotalViews1DB}* of page views mentioned earlier in the report. `;
                                outputString += ` Next, the second most viewed page was '*${pageName2}*' which had *${percentTotalViews2}%* total website views noted in the comparison, in contrast to *${percentTotalViews2DB}* for the page '*${pageName2DB}*' cited earlier. `;     
                            }
        
                            else if(pageName2 == pageName2DB){
                                outputString += `In the comparison period, '*${pageName1}*' was the most visited page at *${percentTotalViews1}* of total views. This compares to *${percentTotalViews1DB}* for the page '*${pageName1DB}*' previously highlighted. `;
                                outputString += `Next, the second most viewed page was the '*${pageName2}*' page which had *${percentTotalViews2}* of total page views, in contrast to the *${percentTotalViews2DB}* cited earlier. `;
                            }
        
                            else{
                                outputString += `In the comparison period, '*${pageName1}*' was the most visited page at *${percentTotalViews1}* of total views. This compares to *${percentTotalViews1DB}* for the page '*${pageName1DB}*' previously highlighted. `;
                                outputString += `Next, the second most viewed page was '*${pageName2}*' which had *${percentTotalViews2}%* of total website views noted in the comparison, in contrast to *${percentTotalViews2DB}* for the page '*${pageName2DB}*' cited earlier. `;     
                            }
                            spaceCounter += 2
                        } catch{
                            //Pass
                        }
    
    
                    } else if (compData[i][0] == 4) { //Time spent
                        try{
                            outputString += `The average duration of visits was *${compDataData}*, compared to the *${databaseData}* visitors spent in the original time frame. `;
                            spaceCounter += 1
                        } catch{
                            //Pass
                        }
    
                    } else if (compData[i][0] == 5) { //Percentage new users
                        try{
                            outputString += `The percentage of new users was *${compDataData}%*, contrasting the *${databaseData}%* of new users noted earlier. `;
                            spaceCounter += 1
                        } catch{
                            //Pass
                        }
    
    
                    } else if (compData[i][0] == 6) { //visitor location and amount
                        try{
                        // Retrieving and formatting data for comparison
                        compDataX = await myAPIcalls.getLocation(clientID, clientFile, startDate, endDate); //seperate as it needs to be formatted a certain way
                        compDataX = formatLocationData(compDataX, 'Location', 'Amount');
                        databaseData = await parseTableData(databaseData, 'Location', 'Amount');
    
    
                        // Creating a map from database data, excluding the headings
                        const databaseMap = new Map(databaseData.slice(1).map(item => [item[0].toLowerCase(), item[1]]));
    
                        // Iterating over the top two entries of the comparison data
                        compDataX.slice(1, 3).forEach((item, index) => {
                            const [location, amount] = item;
                            const dbAmount = databaseMap.get(location.toLowerCase()) || 'no data';
    
                            // Formatting the comparison text based on the index
                            if (index === 0) {
                                outputString += `From ${location.startsWith('United') ? 'the ' : ''}*${location}*, *${numberWithCommas(amount)}* visitor${amount == 1 ? '' : 's'} accessed the site compared to *${numberWithCommas(dbAmount)}* previously`;
                            } else {
                                outputString += `Additionally, ${location.startsWith('United') ? 'the ' : ''}*${location}* saw *${numberWithCommas(amount)}* visitor${amount == 1 ? '' : 's'} this period, versus *${numberWithCommas(dbAmount)}* before`;
                            }
    
                            outputString += index < 1 ? '. ' : '. ';
                        });
                        spaceCounter += 1
                        } catch{
                            //Pass
                        }
    
    
                    } else if (compData[i][0] == 7) { //Referrals
                        try{
                            let start_date;
                            let end_date;
        
                            async function getDates() {
                                try {
                                    const results = await fetchReportDates();
                                    if (results.length > 0) {
                                        start_date = results[0].start_date;
                                        end_date = results[0].end_date;
                                    } else {
                                        console.log('No results found.');
                                    }
                                } catch (error) {
                                    console.error('Error fetching dates:', error);
                                }
                            }
        
                            await getDates();
        
                            start_date = await formatDate(start_date);
                            end_date = await formatDate(end_date);
                            const startDate2 = await formatDate(startDate);
                            const endDate2 = await formatDate(endDate);
        
                            let compDataY = await myAPIcalls.getReferralSessions(clientID, clientFile, startDate2, endDate2);
                            compDataY = formatReferralData(compDataY, 'Origin', 'Sessions');
                            compDataY.toString()
                            compDataY = parseTableData(compDataY, 'Origin', 'Amount'); 
        
                            let databaseDataX = await myAPIcalls.getReferralSessions(clientID, clientFile, start_date, end_date, true); //We must do this seperately as we want non-clumped now.. getting the original start date from the report not the new comp one
                            databaseDataX = formatReferralData(databaseDataX, 'Origin', 'Sessions');
                            databaseDataX.toString()
                            databaseDataX = parseTableData(databaseDataX, 'Origin', 'Amount'); 
        
                            // Creating a map from the database data, skipping the first row (headings)
                            const databaseDataMap = new Map(databaseDataX.slice(1).map(item => [item[0], item[1]]));
                            
                            compDataY.slice(1, 4).forEach((item, index) => {
                                const [origin, sessions] = item;
                                const dbVisitors = databaseDataMap.get(origin) || 'no data';
                                
                                switch (index % 4) {
                                    case 0:
                                        outputString += `From *${origin}*, we recorded *${numberWithCommas(sessions)}* visitor${sessions === 1 ? '' : 's'} during the comparison period, versus *${numberWithCommas(dbVisitors)}* originally`;
                                        spaceCounter += 1
                                        break;
                                    case 1:
                                        outputString += `Secondly, *${origin}* showed *${numberWithCommas(sessions)}* website visit${sessions === 1 ? '' : 's'} in contrast to *${numberWithCommas(dbVisitors)}* previously recorded`;
                                        spaceCounter += 1
                                        break;
                                    case 2:
                                        outputString += ` The website also saw *${numberWithCommas(sessions)}* visit${sessions === 1 ? '' : 's'} from *${origin}* during the comparison period, compared to *${numberWithCommas(dbVisitors)}* in the initial data`;
                                        spaceCounter += 1
                                        break;
                                    default:
                                        outputString += ` For *${origin}’s* users, *${numberWithCommas(sessions)}* visit${sessions === 1 ? '' : 's'} were documented in the recent comparison, against *${numberWithCommas(dbVisitors)}* in earlier records`;
                                        spaceCounter += 1
                                }
                                
                                outputString += index < 1 ? '. ' : '. ';
        
                            });
                        } catch{
                            //Pass
                        }
    
                    } else if (compData[i][0] == 8) { //Device Usage
                        try{
                         // Parsing the table data for comparison and database sources
                         compDataData = await parseTableData(compDataData, 'Device', 'Amount');
                         databaseData = await parseTableData(databaseData, 'Device', 'Amount');
                                                             
                         // Creating a map from the database data, skipping the first row (headings)
                         const databaseDataMap = new Map(databaseData.slice(1).map(item => [item[0], item[1]]));
                         
                         // Iterating over the comparison data to generate a detailed comparison report
                         compDataData.slice(1).forEach((compDataItem, index, array) => {
                             const deviceName = compDataItem[0];
                             const compVisitors = compDataItem[1];
                             const dbVisitors = databaseDataMap.get(deviceName) || 'no data';
                             
                             switch (index % 4) {
                                 case 0:
                                     outputString += `Using *${deviceName}s*, *${numberWithCommas(compVisitors)}* visitor${compVisitors === 1 ? '' : 's'} accessed the website, reflecting a comparison from *${numberWithCommas(dbVisitors)}* outlined earlier`;
                                     spaceCounter += 1
                                     break;
                                 case 1:
                                     outputString += `With *${deviceName}s*, there were *${numberWithCommas(compVisitors)}* website visit${compVisitors === 1 ? '' : 's'} noted, contrasting with the *${numberWithCommas(dbVisitors)}* previously recorded`;
                                     spaceCounter += 1
                                     break;
                                 case 2:
                                     outputString += `The website also saw *${numberWithCommas(compVisitors)}* visit${compVisitors === 1 ? '' : 's'} from *${deviceName}* users during the comparison period, in comparison to *${numberWithCommas(dbVisitors)}* identified earlier on`;
                                     spaceCounter += 1
                                     break;
                                 default:
                                     outputString += `For *${deviceName}s* users, *${numberWithCommas(compVisitors)}* visit${compVisitors === 1 ? '' : 's'} were documented, compared against *${numberWithCommas(dbVisitors)}* in earlier records`;
                                     spaceCounter += 1
                             }
                             
                             // Adding a period and a space after each entry for readability, except for the last sentence
                             outputString += (index < array.length - 1) ? '. ' : '. ';
                         });
                        } catch{
                            //Pass
                        }
    
                    } else if (compData[i][0] == 9) { //Browser Usage
                        try{
                        // Parsing the table data for comparison and database sources
                        compDataData = await parseTableData(compDataData, 'Browser', 'Amount');
                        databaseData = await parseTableData(databaseData, 'Browser', 'Amount');
                        
                        // Creating a map from the database data, skipping the first row (headings)
                        const databaseDataMap = new Map(databaseData.slice(1).map(item => [item[0], item[1]]));
                        
                        // Directly accessing the first two datapoints from the comparison data
                        const firstCompData = compDataData[1]; // assuming the first row is headings
                        const secondCompData = compDataData[2]; // the second datapoint
                        
                        // Retrieve visitor counts and database records for the first datapoint
                        const firstBrowserName = firstCompData[0];
                        const firstCompVisitors = firstCompData[1];
                        const firstDbVisitors = databaseDataMap.get(firstBrowserName) || 'no data';
                        
                        // Retrieve visitor counts and database records for the second datapoint
                        const secondBrowserName = secondCompData[0];
                        const secondCompVisitors = secondCompData[1];
                        const secondDbVisitors = databaseDataMap.get(secondBrowserName) || 'no data';
                        
                        // Constructing the output string for the first two datapoints
                        outputString +=  `Using *${firstBrowserName}*, *${numberWithCommas(firstCompVisitors)}* visitor${firstCompVisitors === 1 ? '' : 's'} viewed the website, versus the aforementioned *${numberWithCommas(firstDbVisitors)}* visitors. `;
                        outputString += `With *${secondBrowserName}*, there were *${numberWithCommas(secondCompVisitors)}* website visit${secondCompVisitors === 1 ? '' : 's'}, contrasting with the previous *${numberWithCommas(secondDbVisitors)}*. `;
                        spaceCounter += 2
                        } catch{
                            //Pass
                        }
    
                    } else if (compData[i][0] == 10) { //Gender
                        try{
                         // Parsing the table data for comparison and database sources
                         compDataData = await parseTableData(compDataData, 'Browser', 'Amount');
                         databaseData = await parseTableData(databaseData, 'Browser', 'Amount');
                         //Unkown cleaning
                         let index = compDataData.findIndex(row => row[0] === 'Unknown');
                         if (index !== -1) {
                             compDataData.splice(index, 1); // Remove the found entry
                         }     
     
                         index = databaseData.findIndex(row => row[0] === 'Unknown');
                         if (index !== -1) {
                             databaseData.splice(index, 1); // Remove the found entry
                         }     
     
                         // Creating a map from the database data, skipping the first row (headings)
                         const databaseDataMap = new Map(databaseData.slice(1).map(item => [item[0], item[1]]));
                         
                         // Iterating over the comparison data to generate a detailed comparison report
                         compDataData.slice(1).forEach((compDataItem, index, array) => {
                             const genderName = compDataItem[0];
                             const compVisitors = compDataItem[1];
                             const dbVisitors = databaseDataMap.get(genderName) || 'no data';
                             
                             switch (index % 4) {
                                 case 0:
                                     outputString += `*${genderName}s* accounted for *${numberWithCommas(compVisitors)}* visitor${compVisitors === 1 ? '' : 's'} in the comparison period, versus *${numberWithCommas(dbVisitors)}* in the original report`;
                                     spaceCounter += 1
                                     break;
                                 case 1:
                                     outputString += `On top of this, *${genderName}s* had generated *${numberWithCommas(compVisitors)}* website visit${compVisitors === 1 ? '' : 's'}, shifting from the *${numberWithCommas(dbVisitors)}* outlined earlier`;
                                     spaceCounter += 1
                                     break;
                                 case 2:
                                     outputString += `The website also saw *${numberWithCommas(compVisitors)}* visit${compVisitors === 1 ? '' : 's'} from *${genderName}* users, deviating from *${numberWithCommas(dbVisitors)}* in the initial data`;
                                     spaceCounter += 1
                                     break;
                                 default:
                                     outputString += `For *${genderName}* users, *${numberWithCommas(compVisitors)}* visit${compVisitors === 1 ? '' : 's'} were documented in the recent comparison, against *${numberWithCommas(dbVisitors)}* in earlier records`;
                                     spaceCounter += 1
                             }
                             
                             // Adding a period and a space after each entry for readability, except for the last sentence
                             outputString += (index < array.length - 1) ? '. ' : '. ';
                         });
                        } catch{
                            //Pass
                        }
    
                    } else if (compData[i][0] == 11) { // Age
                        try{
                        // Parsing the table data for comparison and database sources
                        compDataData = await parseTableData(compDataData, 'Age', 'Amount');
                        databaseData = await parseTableData(databaseData, 'Age', 'Amount');
    
                        // Cleaning unknown data points
                        compDataData = compDataData.filter(row => row[0] !== 'Unknown');
                        databaseData = databaseData.filter(row => row[0] !== 'Unknown');
                    
                        // Creating a map for easy access to the database visitors by age
                        const databaseDataMap = new Map(databaseData.map(item => [item[0], item[1]]));
                    
                        // Directly referencing the first two age groups for comparison
                        if (compDataData.length > 2) {
                            const ageGroup1 = compDataData[1][0];
                            const visitorsGroup1 = compDataData[1][1];
                            const dbVisitorsGroup1 = databaseDataMap.get(ageGroup1) || 'no data';
                            outputString += `From the age group '*${ageGroup1}*', *${numberWithCommas(visitorsGroup1)}* visitor${visitorsGroup1 === 1 ? '' : 's'} accessed the website in the selected time frame, versus *${numberWithCommas(dbVisitorsGroup1)}* in the original report. `;
                            spaceCounter += 1
                    
                            const ageGroup2 = compDataData[2][0];
                            const visitorsGroup2 = compDataData[2][1];
                            const dbVisitorsGroup2 = databaseDataMap.get(ageGroup2) || 'no data';
                            outputString += `Next, the group of '*${ageGroup2}*' year olds created *${numberWithCommas(visitorsGroup2)}* website visit${visitorsGroup2 === 1 ? '' : 's'}, in contrast to *${numberWithCommas(dbVisitorsGroup2)}* noted earlier. `;
                            spaceCounter += 1
    
                        } else if (compDataData.length > 1){
                            const ageGroup1 = compDataData[1][0];
                            const visitorsGroup1 = compDataData[1][1];
                            const dbVisitorsGroup1 = databaseDataMap.get(ageGroup1) || 'no data';
                            outputString += `From the age group '*${ageGroup1}*', *${numberWithCommas(visitorsGroup1)}* visitor${visitorsGroup1 === 1 ? '' : 's'} accessed the website in the selected time frame, versus *${numberWithCommas(dbVisitorsGroup1)}* in the original report. `;
                            spaceCounter += 1
                        } else{
                            console.error(`Couldn't find any Age data in the comparison period.`);
                        }
                        } catch{
                            //Pass
                        }
                    
                    } else if (compData[i][0] == 12) { // Language
                        try{
                        // Parsing the table data for comparison and database sources
                        compDataData = await parseTableData(compDataData, 'Language', 'Amount');
                        databaseData = await parseTableData(databaseData, 'Language', 'Amount');
                    
                        // Creating a map for easy access to the database visitors by language
                        const databaseDataMap = new Map(databaseData.map(item => [item[0], item[1]]));
                    
                        if (compDataData.length > 2) {
                            const language1 = compDataData[1][0];
                            const visitorsLanguage1 = compDataData[1][1];
                            const dbVisitorsLanguage1 = databaseDataMap.get(language1) || 'no data';
                            outputString += `Using *${language1}*, *${numberWithCommas(visitorsLanguage1)}* visitor${visitorsLanguage1 === 1 ? '' : 's'} visited the website. Comparatively, we noted *${numberWithCommas(dbVisitorsLanguage1)}* visit${visitorsLanguage1 === 1 ? '' : 's'} over the initial report. `;
                            spaceCounter += 1
    
                            const language2 = compDataData[2][0];
                            const visitorsLanguage2 = compDataData[2][1];
                            const dbVisitorsLanguage2 = databaseDataMap.get(language2) || 'no data';
                            outputString += `With *${language2}* coming next, there were *${numberWithCommas(visitorsLanguage2)}* website visit${visitorsLanguage2 === 1 ? '' : 's'} noted, in contrast to *${numberWithCommas(dbVisitorsLanguage2)}*. `;
                            spaceCounter += 1
                        
                        }else if (compDataData.length > 1) {
                            const language1 = compDataData[1][0];
                            const visitorsLanguage1 = compDataData[1][1];
                            const dbVisitorsLanguage1 = databaseDataMap.get(language1) || 'no data';
                            outputString += `Using *${language1}*, *${numberWithCommas(visitorsLanguage1)}* visitor${visitorsLanguage1 === 1 ? '' : 's'} visited the website. Comparatively, we noted *${numberWithCommas(dbVisitorsLanguage1)}* visit${visitorsLanguage1 === 1 ? '' : 's'} over the initial report. `;
                            spaceCounter += 1
    
                        }else{
                            console.error(`Couldn't find any Language data in the comparison period.`);
                        }
                        } catch{
                            //Pass
                        }
     
                    } else if (compData[i][0] == 13) { // Bounce Rate
                        try{
                        // Parsing the table data for comparison and database sources
                        compDataData = await parseTableData(compDataData, 'Bounce rate', 'Amount');
                        databaseData = await parseTableData(databaseData, 'Bounce rate', 'Amount');
                    
                        // Creating a map for easy access to the database visitors by language
                        const databaseDataMap = new Map(databaseData.map(item => [item[0], item[1]]));
                    
                        // Directly referencing the first two languages for comparison
                        if (compDataData.length > 2) {
                            const bounceRate1 = compDataData[1][1];
                            const visitorOrigin1 = compDataData[1][0];
                            const dbBounce1 = databaseDataMap.get(visitorOrigin1) || 'no recorded data';
                            outputString += `An average bounce rate of *${bounceRate1}%* was recorded for '*${visitorOrigin1}*' visitor${visitorOrigin1 === 1 ? '' : 's'}. This signifies a comparison to the *${dbBounce1}${dbBounce1 === 'no recorded data' ? '' : '%'}* outlined earlier. `;
                            spaceCounter += 1
                        
                            const bounceRate2 = compDataData[2][1];
                            const visitorOrigin2 = compDataData[2][0];
                            const dbBounce2 = databaseDataMap.get(visitorOrigin2) || 'no recorded data';
                            outputString += `Next, we measured a *${bounceRate2}%* bounce rate from '*${visitorOrigin2}*' referral${visitorOrigin2 === 1 ? '' : 's'}, highlighting a contrast to the *${dbBounce2}${dbBounce2 === 'no recorded data' ? '' : '%'}* previously recorded. `;
                            spaceCounter += 1
                        } if (compDataData.length > 1) {
                            const bounceRate1 = compDataData[1][1];
                            const visitorOrigin1 = compDataData[1][0];
                            const dbBounce1 = databaseDataMap.get(visitorOrigin1) || 'no recorded data';
                            outputString += `An average bounce rate of *${bounceRate1}%* was recorded for '*${visitorOrigin1}*' visitor${visitorOrigin1 === 1 ? '' : 's'}. This signifies a comparison to the *${dbBounce1}${dbBounce1 === 'no recorded data' ? '' : '%'}* outlined earlier. `;
                            spaceCounter += 1
                        } else{
                            console.error(`Couldn't find any Bounce Rate data in the comparison period.`);
                        } 
                        } catch{
                            //Pass
                        }
              
                    } else if (compData[i][0] == 14) { // Scroll Depth
                        try{
                            // Parsing the table data for comparison and database sources
                            compDataData = await parseTableData(compDataData, 'Depth', 'Amount');
                            databaseData = await parseTableData(databaseData, 'Depth', 'Amount');
                        
                            // Creating a map for easy access to the database visitors by language
                            const databaseDataMap = new Map(databaseData.map(item => [item[0], item[1]]));
                        
                            // Directly referencing the first two languages for comparison
                            if (compDataData.length > 2) {
                                const scrollDepth1 = compDataData[1][1];
                                const visitorOrigin1 = compDataData[1][0];
                                const dbDepth1 = databaseDataMap.get(visitorOrigin1) || 'no recorded data';
                                outputString += `An average scroll depth of *${scrollDepth1}%* was recorded for '*${visitorOrigin1}*' visitor${visitorOrigin1 === 1 ? '' : 's'}, versus *${dbDepth1}${dbDepth1 === 'no recorded data' ? '' : '%'}* discussed previously. `;
                                spaceCounter += 1
                            
                                const scrollDepth2 = compDataData[2][1];
                                const visitorOrigin2 = compDataData[2][0];
                                const dbDepth2 = databaseDataMap.get(visitorOrigin2) || 'no recorded data';
                                outputString += `We then measured a *${scrollDepth2}%* scroll depth from '*${visitorOrigin2}*' referral${visitorOrigin2 === 1 ? '' : 's'}, in contrast to *${dbDepth2}${dbDepth2 === 'no recorded data' ? '' : '%'}* previously recorded. `;
                                spaceCounter += 1
    
                            } else if (compDataData.length > 1) {
                                const scrollDepth1 = compDataData[1][1];
                                const visitorOrigin1 = compDataData[1][0];
                                const dbDepth1 = databaseDataMap.get(visitorOrigin1) || 'no recorded data';
                                outputString += `An average scroll depth of *${scrollDepth1}%* was recorded for '*${visitorOrigin1}*' visitor${visitorOrigin1 === 1 ? '' : 's'}, versus *${dbDepth1}${dbDepth1 === 'no recorded data' ? '' : '%'}* discussed previously. `;
                                spaceCounter += 1
                            } else{
                                console.error(`Couldn't find any Scroll Rate data in the comparison period.`);
                            }  
                        } catch{
                            //Pass
                        }
                }
            }
                
            // Now, write the processed string to the PDF
            await pdfwriting.addSpace(doc, 5);
            await pdfwriting.addContentToPdf(doc, outputString, fontPath, fontPathBold, textSize, false);
            
    
            } catch (error) {
                console.error('Error:', error);
            } finally {
            }
        };
    
        await prepareCompData();
    
        pdfwriting.addSpace(doc, endOfSegmentSpace);
        
        if(spaceCalcMode == true){
            endPos = await pdfwriting.finalisePdf(doc, true);
            heightDiff = endPos - startPos;
            return heightDiff
        }
    } catch{
        console.error('Issue with comparison section, not adding it to the report')
    }
}
    


module.exports = {
    visitorStatisticsFunc,
    visitorLocationFunc,
    referralsBreakdownFunc,
    pagesViewedFunc,
    demographicsFunc,
    usersByDeviceFunc,
    usersByBrowserFunc,
    searchEnginePositionsFunc,
    googleAdsFunc,
    bingAdsFunc,
    conversionsFunc,
    conversionReferralDataFunc,
    landingPagesFunc,
    insightsFunc,
    summaryFunc,
    engagementFunc,
    comparisonFunc,
    summaryFunc
};
