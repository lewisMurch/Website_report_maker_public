//Imports
const { header } = require('express/lib/request');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const puppeteer = require('puppeteer');
const { google } = require('googleapis');
const mysql = require('mysql');
const util = require('util');
const sharp = require('sharp');
const os = require('os');
const databaseFuncs = require(__dirname + '/databaseFuncs'); 
//Imports

//PAGE INFO - Page Height = 792 pdfkit points, margins are 20 each end, leaving 752 per page

// Global Values
const fontPath = 'Fonts/Lato/Lato-Light.ttf';
const fontPathBold = 'Fonts/Lato/Lato-Regular.ttf';
const fontPathItalic = 'Fonts/Lato/Lato-Italic.ttf';
let textSize = 12;
let currentPosition = { x: 20, y: 20 }; // Default starting position for text being added.
let currentPageNumber = 1;
const margin_top = 20
const margin_bottom = 20
const margin_left = 45
const margin_right = 45
// Global Values

function nextPage(doc){
    doc.addPage();
    // Reset currentPosition for the new page
    currentPosition = { x: margin_top, y: margin_left }; 
    currentPageNumber++;
    return
}

function resetCurrentPageNumber(){
    currentPageNumber = 1;
    return
}

function getPageNumber(doc) {
    return currentPageNumber;
}

function createPdfDoc(filePath, outputFolder = 'output') {

    if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
    }
    // Create a new PDF document with custom margins
    const doc = new PDFDocument({
      margins: {
        top: margin_top,  
        bottom: margin_bottom, 
        left: margin_left,   
        right: margin_right   
      }
    });
    
    // Pipe the document to a file
    doc.pipe(fs.createWriteStream(outputFolder + '/' + filePath));
    return doc; //return the object
}

function addContentToPdf(doc, markedText, fontPath, fontPathBold, fontSize = textSize, lineSpacing = 1.5) {
    // Split the text by asterisks to identify bold parts
    const parts = markedText.split('*');
    let isBold = false; // Track whether the current part should be bold

    // Initial setup before iterating through parts
    doc.fontSize(fontSize).lineGap(lineSpacing);

    parts.forEach((part, index) => {
        if (part.length === 0) {
            isBold = !isBold; // Toggle isBold if part is empty, meaning we encountered consecutive asterisks
            return; // Skip further processing for this empty part
        }

        // Apply font based on whether text is bold
        doc.font(isBold ? fontPathBold : fontPath);

        // Add the text part with the correct options
        const textOptions = {
            continued: index !== parts.length - 1, // Continue if not the last part
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right
        };

        // Positioning for the text
        if (index === 0) {
            // If it's the first part, use the current position
            doc.text(part, currentPosition.x, currentPosition.y, textOptions);
        } else {
            // For subsequent parts, use the updated doc.x and doc.y for positioning
            doc.text(part, doc.x, doc.y, textOptions);
        }        
        // Toggle isBold for the next part
        isBold = !isBold;
    });

    // After all parts are added, finalize the line
    doc.text('', {continued: false});
    // Optionally, adjust currentPosition.y by a fixed amount or based on a hypothetical text height
    currentPosition.y += doc.currentLineHeight() * lineSpacing;

    // Reset line spacing to default after text addition
    doc.lineGap(0);

    currentPosition.x = doc.x;
    currentPosition.y = doc.y;
}

function addSpace(doc, size = 5, moveToNextPage = false){ //adds a little gap when called, so the text isn't squished
    addContentToPdf(doc, ' ', fontPath, fontPathBold, size, false, moveToNextPage);
}

async function generateTableAndEmbed(doc, data, hasHeadings = true, showIndex = false, rightAlignFinalColumn = true, space_before = 8, n = 10) {
    const adjustedData = hasHeadings ? [data[0], ...data.slice(1, n)] : data.slice(0, n + 1);
    const dataSize = hasHeadings ? data.length - 1 : data.length;
    n = Math.min(n, dataSize);

    // Generate table HTML with the adjusted data
    const html = generateTableHTML(adjustedData, hasHeadings, showIndex, rightAlignFinalColumn);
    let browser;
    if (os.platform() === 'linux') { //Testing on my Pi 5
        browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium-browser' });
    }
    else{
        browser = await puppeteer.launch();
    }
    const page = await browser.newPage();
    
    // Set initial viewport size, ensuring values are integers
    await page.setViewport({
        width: Math.round(800), // Use round, floor, or ceil as appropriate
        height: Math.round(600),
        deviceScaleFactor: 2
    });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const tableBoundingBox = await getTableBoundingBox(page);
    
    // Ensure viewport adjustment values are integers and deviceScaleFactor is appropriate
    await page.setViewport({
        width: Math.max(800, Math.ceil(tableBoundingBox.width)),
        height: Math.max(600, Math.ceil(tableBoundingBox.height)),
        deviceScaleFactor: 2
    });
    
    // Take a screenshot as a buffer, ensuring clip dimensions are integers
    const tableImageBuffer = await page.screenshot({
        encoding: 'binary',
        clip: {
            x: Math.round(tableBoundingBox.x),
            y: Math.round(tableBoundingBox.y),
            width: Math.round(tableBoundingBox.width),
            height: Math.round(tableBoundingBox.height)
        }
    });
    
    // Use sharp to trim the whitespace from the screenshot and process the image
    const trimmedImageBuffer = await sharp(tableImageBuffer)
        .trim() // Automatically trims edges that match the background color
        .toBuffer(); // Convert back to buffer for further use
    
    // Calculate scaled dimensions, ensuring width is an integer
    const scaleFactor = 0.1; // Scaling factor to adjust the image size
    const scaledWidth = Math.round(tableBoundingBox.width * scaleFactor);
    
    // Embed the trimmed and scaled table image with scaled dimensions
    doc.image(trimmedImageBuffer, { width: scaledWidth });
    
    await browser.close();
    
    currentPosition.x = doc.x;
    currentPosition.y = doc.y;
}

function generateTableHTML(data, hasHeadings, showIndex, rightAlignFinalColumn) {
    // Define styles and start table
    let html = `
    <style>
    /* Define font faces */
    @font-face {
        font-family: 'Lato';
        src: url('${fontPath}') format('truetype');
        font-weight: 300; /* Light */
    }
    
    @font-face {
        font-family: 'Lato-Bold'; /* Change font-family for bold font */
        src: url('${fontPathBold}') format('truetype');
        font-weight: bold; /* Bold */
    }
    
    /* Apply styles to HEADERS */
    th {
        font-family: 'Lato-Bold', sans-serif; /* Use bold font-family */
        font-weight: bold; /* Set explicitly to bold */
        font-size: 120px; /* Fixed font size for headings */
        white-space: nowrap; /* Prevent wrapping */
        padding: 40px 100px;
        border: 3px solid darkgrey; /* Change border color to light grey */
    }
    
    tr:first-child td {
        border-top: none;
    }
    
    /* Apply styles to DATA CELLS */
    td {
        font-family: 'Lato', sans-serif;
        font-weight: 300; /* Light */
        font-size: 120px; /* Fixed font size for data cells */
        white-space: nowrap; /* Prevent wrapping */
        padding: 40px 100px;
        border: 3px solid darkgrey; /* Change border color to light grey */
    }
    
    table {
        border-collapse: collapse; /* Collapse borders */
        border: none; /* Remove border from the table */
    }
    
    
    th:first-child,
    td:first-child {
        border-left: none; /* Remove left border for the first cell in each row */
    }
    
    th:last-child,
    td:last-child {
        border-right: none; /* Remove right border for the last cell in each row */
        ${rightAlignFinalColumn ? 'text-align: right;' : ''} /* Right-align final column if enabled */
    }
    
    th {
        color: black;
    }
    
    th:first-child {
        text-align: left;
    }
    
    th:last-child {
        text-align: right;
    }
    
    
    tr:last-child td { /* Select last row's cells and remove bottom border */
        border-bottom: none;
    }
    
    tr:nth-child(odd) {
        background-color: rgba(242, 242, 242, 0.9); /* Adjust alpha (last value) as needed */
    }
    </style>
    <table id="myTable">
    
        ${data.map((row, index) => {
            if (hasHeadings && index === 0) {
                if (showIndex) {
                    return `<tr>${row.map(cell => `<th>${cell}</th>`).join('')}</tr>`;
                } else {
                    return `<tr>${row.map(cell => `<th>${cell}</th>`).join('')}</tr>`;
                }
            } else if (!hasHeadings && index === 0) {
                return ''; // Don't include header row
            } else {
                if (showIndex) {
                    return `<tr>${row.map((cell, idx) => idx === 0 ? `<td>${index}${index > 9 ? '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;' : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}${cell}</td>` : `<td>${cell}</td>`).join('')}</tr>`;            
                } else {
                    return `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
                }
            }
        }).join('')}
    </table>
    `;

    // Generate rows
    data.forEach((row, index) => {
        const isHeadingRow = hasHeadings && index === 0;
        const rowHTML = row.map((cell, cellIndex) => {
            // Determine cell type and alignment
            const cellType = isHeadingRow ? 'th' : 'td';
            const alignStyle = rightAlignFinalColumn && cellIndex === row.length - 1 ? ' style="text-align: right;"' : '';
            const cellContent = showIndex && cellIndex === 0 ? `${index} ${cell}` : cell;
            return `<${cellType}${alignStyle}>${cellContent}</${cellType}>`;
        }).join('');

        html += `<tr>${rowHTML}</tr>`;
    });

    // Close table
    html += `</table>`;
    return html;
}

async function getTableBoundingBox(page) {
    return page.evaluate(() => {
        const table = document.getElementById('myTable');
        const { x, y, width, height } = table.getBoundingClientRect();
        return { x, y, width, height };
    });
}

async function generateGraphAndEmbed(doc, data, left_heading_name = 'Data', space_before = 16, text_size = 20, max_data_size = 11 ) { //KEEP MAX DATA SIZE AT 11

    data = data.slice(0, max_data_size);
    data = data.slice(1);

    let graph_start_width = 1200;
    let graph_start_height = 800;

    // Calculate the maximum value from the data for the background bars
    const maxValue = Math.max(...data.map(item => parseInt(item[1], 10)));

    // Calculate the combined length of the longest label and value
    const longestCombinedLength = Math.max(...data.map(item => item[0].length + item[1].length));

    const totalValueForScaling = data.reduce((acc, item) => acc + parseInt(item[1], 10), 0);

    // Base settings for scaling
    const baseWidthPercent = 60; // Starting width percentage for the base character count
    const baseCharacterCount = 18; // Base character count for the starting width

    // Find the length of the longest label in the data
    const longestLabelLength = Math.max(...data.map(item => item[0].length));
    // Find the length of the longest value in the data
    const longestValueLength = Math.max(...data.map(item => item[1].length));

    // Calculate the left padding based on the longest label length
    let leftPadding = '8%'; // Default padding
    if (longestLabelLength > 10) {
        const scale = Math.min((longestLabelLength - 16) / (32 - 16), 1); // Ensures scale does not exceed 1
        leftPadding = `${20 + scale * (25 - 20)}%`; // Linear scaling between 20% and 40%
    }

    // Calculate the right padding based on the longest value length
    let rightPadding = '20%'; // Default padding
    if (longestValueLength > 3) {
        const scale = Math.min((longestValueLength - 3) / (10 - 3), 1); // Ensures scale does not exceed 1
        rightPadding = `${20 + scale * (30 - 20)}%`; // Linear scaling between 20% and 30%
    }

    // Convert data to a format suitable for annotations and background bars
    const annotatedData = data.map(item => {
        let value = parseInt(item[1], 10);
        let remainingValue = totalValueForScaling - value; // This line would change based on your exact need
        let annotation = '‎ ‎ ‎ ' + value.toString(); // Add spaces before annotation
        return [item[0], value, remainingValue, annotation];
    });

    // Generate dynamic headings for each data entry
    let dynamicHeadings = '';
    data.forEach((item, index) => {
        // Apply normal font weight to dynamic headings
        dynamicHeadings += `<div class="chart-heading-left" style="position: absolute; top: ${(((54) * index))}px; left: 0px; font-weight: normal;">${item[0]}</div>\n`;
    
        //dynamicHeadings += `<div class="chart-heading-left" style="position: absolute; top: ${(((5.35 * data.length) * index) + 34)}px; left: 0px; font-weight: normal;">${item[0]}</div>\n`;
    });

    const leftHeadingFontSize = text_size * 1.15;

    const html = `
    <html>
    <head>
        <link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap" rel="stylesheet">
        <script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
        <script type="text/javascript">
            google.charts.load('current', {packages: ['corechart']});
            google.charts.setOnLoadCallback(drawChart);
    
            function drawChart() {
                const data = new google.visualization.DataTable();
                data.addColumn('string', 'Channel');
                data.addColumn('number', 'Sessions');
                data.addColumn('number', 'Remaining');
                data.addColumn({type: 'string', role: 'annotation'});
                data.addRows(${JSON.stringify(annotatedData)});
    
                const options = {
                    bars: 'horizontal',
                    isStacked: true,
                    hAxis: {
                        textPosition: 'none',
                        gridlines: { color: 'transparent' },
                        baselineColor: 'transparent',

                    },
                    vAxis: {
                        textPosition: 'none',
                        textStyle: {
                            bold: true,
                            fontSize: 0,
                            fontName: 'Lato'
                        },
                        baselineColor: 'transparent',
                        gridlines: { color: 'transparent' }
                    },
                    annotations: {
                        alwaysOutside: true,
                        textStyle: {
                            fontSize: ${text_size},
                            auraColor: 'none',
                            color: 'black',
                            fontName: 'Lato'
                        }
                    },
                    legend: { position: 'none' },
                    height: 600,
                    width: 1200,
                    series: {
                        0: { color: '#1c91c0' },
                        1: { color: '#e9e9e9' }
                    },
                    bar: { groupWidth: '20%' },
                    chartArea: {
                        left: '0%',
                        right: '${rightPadding}',
                        top: '5%',
                        height: '${data.length * 9}%',
                    }
                };
    
                const chart = new google.visualization.BarChart(document.getElementById('chart_div'));
                chart.draw(data, options);
            }
        </script>
        <style>
            .chart-container {
                position: relative;
                width: 1200px; /* Adjust if necessary */
                height: 800px; /* Adjust if necessary */
            }
            .chart-heading-left{
                position: absolute;
                z-index: 10;
                font-size: ${text_size}px;
                font-family: 'Lato', sans-serif;
            }
            .chart-heading-left {
                top: 0px; /* Adjust this value to vertically align */
                left: 0; 
            }
            
            #chart_div {
                /* Ensure this div has specific dimensions to prevent the chart from disappearing */
                width: 1200px; /* Adjust based on the actual width of your chart */
                height: 800px; /* Adjust based on the actual height of your chart */
            }
        </style>
    </head>
        <body style="font-family: 'Lato', sans-serif;">
        <div class="chart-container">
            
            ${dynamicHeadings}
            <div id="chart_div" style="position: relative; top: -24px;"></div>
        </div>
    </body>
    </html>
    `;

    let browser;
    if (os.platform() === 'linux') { //Testing on my Pi 5
        browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium-browser' });
    }
    else{
        browser = await puppeteer.launch();
    }
    const page = await browser.newPage();
    await page.setViewport({ width: graph_start_width, height: graph_start_height, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Take a screenshot as a buffer
    const chartImageBuffer = await page.screenshot({ encoding: 'binary' });

    // Use sharp to trim the whitespace from the screenshot
    const trimmedImageBuffer = await sharp(chartImageBuffer)
        .trim() // Automatically trims edges that match the background color, assuming it's white
        .toBuffer(); // Convert back to buffer for further use

    // Use the trimmed image buffer as needed, for example, in a document
    doc.image(trimmedImageBuffer, {
        // The fit might need adjustment depending on the new size of the trimmed image
        fit: [(graph_start_width * 10) / 25, (graph_start_height * 10) /25], 
        align: 'left',
    });

    await browser.close();

    currentPosition.x = doc.x;
    currentPosition.y = doc.y; // Adjust positioning as needed
}

async function finalisePdf(doc, indent = false) {
    doc.end();
    if(indent){
        //pass
    }
    else{
        console.log('PDF closed');
    }
    final_y_pos = currentPosition.y
    //Reset the dimensions for the next instance of a PDF
        currentPosition.y = await getMarginTop();
        currentPosition.x = await getMarginLeft();
    return final_y_pos;
}

async function generatePieChartAndEmbed(doc, data, chart_heading = 'Data', space_before = 16, text_size = 20) {
    data = data.slice(1); // Assuming the first row is headers

    let graph_start_width = 600;
    let graph_start_height = 600;

    // Calculate the total value for the pie chart
    const totalValueForPie = data.reduce((acc, item) => acc + parseInt(item[1], 10), 0);

    // Convert data to a format suitable for the pie chart
    const pieChartData = data.map(item => [item[0], parseInt(item[1], 10)]);

    const pieChartTitleFontSize = text_size * 1.15; // Adjust title font size based on input text size

    const html = `
    <html>
    <head>
        <link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap" rel="stylesheet">
        <script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
        <script type="text/javascript">
            google.charts.load('current', {packages: ['corechart']});
            google.charts.setOnLoadCallback(drawChart);
    
            function drawChart() {
                const data = google.visualization.arrayToDataTable([
                    ['Label', 'Value'],
                    ...${JSON.stringify(pieChartData)}
                ]);

                const options = {
                    pieHole: 0.4,
                    height: 800,
                    width: 690, 
                    fontSize: ${text_size},
                    fontName: 'Lato',
                    chartArea: {
                        left: '5%',
                        top: '5%',
                        right: '5%',
                        bottom: '5%',
                        width: '90%',
                        height: '90%'
                    },
                    legend: { 
                        position: 'right', 
                        alignment: 'center' 
                    }
                };
    
                const chart = new google.visualization.PieChart(document.getElementById('chart_div'));
                chart.draw(data, options);
            }
        </script>
        <style>
            .chart-container {
                position: relative;
                width: 1200px;
                height: 800px;
            }
            #chart_div {
                width: 100%;
                height: 100%;
            }
        </style>
    </head>
    <body>
        <div class="chart-container">
            <div id="chart_div"></div>
        </div>
    </body>
    </html>
    `;

    let browser;
    if (os.platform() === 'linux') { // Testing on a Linux system, e.g., Raspberry Pi
        browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium-browser' });
    } else {
        browser = await puppeteer.launch();
    }
    const page = await browser.newPage();
    await page.setViewport({ width: graph_start_width, height: graph_start_height, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Take a screenshot as a buffer with specified encoding to be compatible with sharp
    const chartImageBuffer = await page.screenshot({ encoding: 'binary' });
    
    // Use sharp to trim the whitespace from the screenshot
    const trimmedImageBuffer = await sharp(chartImageBuffer)
        .trim() // Automatically trims edges that match the background color
        .toBuffer(); // Convert back to buffer for further use in the document
    
    // Use the trimmed image buffer in the document. The fit might need adjustment.
    doc.image(trimmedImageBuffer, {
        fit: [graph_start_width / 2.5, graph_start_height / 2.5], // Adjust based on the trimmed image size
        align: 'left', 
    });
    
    await browser.close();
    
    // Update currentPosition to reflect where the next content should start
    currentPosition.x = doc.x;
    currentPosition.y = doc.y; 
}

async function generateDualPieChartsAndEmbed(doc, data1, data2, chart_headings = ['Data 1', 'Data 2'], space_before = 16, text_size = 20) {
    // Process the first data stream, skipping headers
    data1 = data1.slice(1);
    // Process the second data stream, similarly skipping headers
    data2 = data2.slice(1);

    let graph_start_width = 1200; // Adjust if necessary to accommodate both charts
    let graph_start_height = 600; // Adjust if necessary

    // Calculate total values for both pie charts
    const totalValueForPie1 = data1.reduce((acc, item) => acc + parseInt(item[1], 10), 0);
    const totalValueForPie2 = data2.reduce((acc, item) => acc + parseInt(item[1], 10), 0);

    // Convert both data streams to formats suitable for pie charts
    const pieChartData1 = data1.map(item => [item[0], parseInt(item[1], 10)]);
    const pieChartData2 = data2.map(item => [item[0], parseInt(item[1], 10)]);

    const pieChartTitleFontSize = text_size * 1.15; // Adjust title font size based on input text size

    const html = `
    <html>
    <head>
        <link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap" rel="stylesheet">
        <script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
        <script type="text/javascript">
            google.charts.load('current', {packages: ['corechart']});
            google.charts.setOnLoadCallback(drawCharts);
    
            function drawCharts() {
                // Draw the first chart
                const data1 = google.visualization.arrayToDataTable([
                    ['Label', 'Value'],
                    ...${JSON.stringify(pieChartData1)}
                ]);
    
                const options1 = {
                    pieHole: 0.4,
                    height: 800,
                    width: 690, // Adjusted to fit two charts side by side
                    fontSize: ${text_size},
                    fontName: 'Lato',
                    chartArea: {
                        left: '5%',
                        top: '5%',
                        right: '5%',
                        bottom: '5%',
                        width: '90%',
                        height: '90%'
                    },
                    legend: { 
                        position: 'right', 
                        alignment: 'center' 
                    }
                };
    
                const chart1 = new google.visualization.PieChart(document.getElementById('chart_div1'));
                chart1.draw(data1, options1);
    
                // Draw the second chart
                const data2 = google.visualization.arrayToDataTable([
                    ['Label', 'Value'],
                    ...${JSON.stringify(pieChartData2)}
                ]);
    
                const options2 = {
                    pieHole: 0.4,
                    height: 800,
                    width: 690, 
                    fontSize: ${text_size},
                    fontName: 'Lato',
                    chartArea: {
                        left: '5%',
                        top: '5%',
                        right: '5%',
                        bottom: '5%',
                        width: '90%',
                        height: '90%'
                    },
                    legend: { 
                        position: 'right', 
                        alignment: 'center' // Adjust the alignment to 'start', 'center', or 'end' as needed
                    }
                };
    
                const chart2 = new google.visualization.PieChart(document.getElementById('chart_div2'));
                chart2.draw(data2, options2);
            }
        </script>
        <style>
            .chart-container {
                display: flex;
                justify-content: space-between;
                position: relative;
                width: 1200px; // Ensure this accommodates both charts side by side
                height: 400px; // Adjust as needed
            }
            .chart-div {
                width: 50%;
                height: 100%;
            }
        </style>
    </head>
    <body>
        <div class="chart-container">
            <div id="chart_div1" class="chart-div"></div>
            <div id="chart_div2" class="chart-div"></div>
        </div>
    </body>
    </html>
    `;
    
    // Launch the browser, create a new page, set content, and take screenshot as before
    let browser;
    if (os.platform() === 'linux') {
        browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium-browser' });
    } else {
        browser = await puppeteer.launch();
    }
    const page = await browser.newPage();
    await page.setViewport({ width: graph_start_width, height: graph_start_height, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Take a screenshot as a buffer, then use sharp to trim and embed in the document as before
    const chartImageBuffer = await page.screenshot({ encoding: 'binary' });
    const trimmedImageBuffer = await sharp(chartImageBuffer).trim().toBuffer();
    doc.image(trimmedImageBuffer, {
        fit: [graph_start_width / 2.5, graph_start_height / 2.5],
        align: 'left', 
    });
    
    await browser.close();
    
    // Update currentPosition for document layout purposes
    currentPosition.x = doc.x;
    currentPosition.y = doc.y; 
}

async function generateStackedBarChartsAndEmbed(doc, data1, data2, chart_headings = ['Data 1', 'Data 2']) {
    // Process the provided data arrays to match the Google Charts data format
    const processChartData = (data) => {
        // The first element of the array will be the header; it starts with a label for the row,
        // followed by the labels for each data point which will become the segments of the stacked bar.
        const header = ['Category'];
    
        // Create a single row for the data with a label 'Data'.
        const rowData = ['Data'];
    
        // Skip the first item since it's the header row.
        for (let i = 1; i < data.length; i++) {
            header.push(data[i][0]); // Add the category to the header.
            rowData.push(parseInt(data[i][1], 10)); // Add the numeric value to the row.
        }
    
        // The final array for Google Charts should have two rows: one for headers and one for the row data.
        return [header, rowData];
    };
    
    

    const graphWidth = 2000; // Width adjusted for embedding
    const graphHeight = 200; // Height adjusted for a clearer display in the document
    const combinedData1 = processChartData(data1);
    const combinedData2 = processChartData(data2);

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap" rel="stylesheet">
        <script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
        <script type="text/javascript">
            google.charts.load('current', {packages: ['corechart']});
            google.charts.setOnLoadCallback(drawCharts);
    
            function drawCharts() {
                const containerWidth = document.getElementById('chart_div1').offsetWidth;
                const options = {
                    isStacked: 'percent',
                    height: ${graphHeight},
                    width: containerWidth / 1.5,
                    legend: { position: 'top', alignment: 'end' },
                    colors: ['#36013f', '#3366CC', '#DC3911', '#FF9900', '#0D9618', '#990099', '#0099C6', '#DD4477'],
                    bar: { groupWidth: '70%' },
                    fontSize: 14,
                    fontName: 'Lato',
                    chartArea: {width: '100%', height: '100%'},
                    vAxis: { 
                        textPosition: 'none',
                        baselineColor: 'transparent',
                        gridlines: { color: 'transparent' },
                        minorGridlines: { color: 'transparent' }
                    },
                    hAxis: { 
                        textPosition: 'none',
                        baselineColor: 'transparent',
                        gridlines: { color: 'transparent' },
                        minorGridlines: { color: 'transparent' }
                    }
                };
    
                const data1 = google.visualization.arrayToDataTable(${JSON.stringify(combinedData1)});
                const chart1 = new google.visualization.BarChart(document.getElementById('chart_div1'));
                chart1.draw(data1, options);
    
                const data2 = google.visualization.arrayToDataTable(${JSON.stringify(combinedData2)});
                const chart2 = new google.visualization.BarChart(document.getElementById('chart_div2'));
                chart2.draw(data2, options);
            }

            
        </script>
    </head>
    <body>
        <div style="display: flex; justify-content: space-between;">
            <div style="flex: 1; margin-right: 0px;"> 
                <!-- Inline style to increase the font size -->
                <h2 style="font-size: 3em;">${chart_headings[0]}</h2>
                <div id="chart_div1" style="width: 100%; height: 100px;"></div>
            </div>
            <div style="flex: 1; padding: 0 10px;">
                <!-- Inline style to increase the font size -->
                <h2 style="font-size: 3em;">${chart_headings[1]}</h2>
                <div id="chart_div2" style="width: 100%; height: 100px;"></div>
            </div>
        </div>
    </body>
    </html>
    `;
    
    // Puppeteer browser initialization adapted to your environment
    let browser;
    if (os.platform() === 'linux') {
        browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium-browser' });
    } else {
        browser = await puppeteer.launch();
    }
    const page = await browser.newPage();
    await page.setViewport({ width: graphWidth, height: graphHeight }); // Adjust viewport height as now graphs are side by side
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Wait for the charts to be fully rendered before taking a screenshot
    await page.waitForSelector('#chart_div2', { visible: true });
    
    const chartImageBuffer = await page.screenshot({ encoding: 'binary' });
    doc.image(chartImageBuffer, {
        fit: [graphWidth/4, graphHeight/4], // Fit the image to the page dimensions
        align: 'left',
    });
    
    await browser.close();

    // Update currentPosition for document layout purposes
    currentPosition.x = doc.x;
    currentPosition.y = doc.y; 
}

async function getMarginTop(){
    return margin_top;
}

async function getMarginBottom(){
    return margin_bottom;
}

async function getMarginLeft(){
    return margin_left;
}

async function createCoverPage(doc, website_name, headerSize){
    reportName = await databaseFuncs.getReportName();
    await addContentToPdf(doc, `${reportName}`, fontPath, fontPathBold, headerSize * 1.2)
    await addSpace(doc, 10);
    await addContentToPdf(doc, `Reporting on: *${website_name}*`, fontPath, fontPathBold, headerSize * 0.9)
}

module.exports = {
    getPageNumber: getPageNumber,
    nextPage: nextPage,
    createPdfDoc: createPdfDoc,
    addContentToPdf: addContentToPdf,
    addSpace: addSpace,
    generateTableAndEmbed: generateTableAndEmbed,
    generateTableHTML: generateTableHTML,
    getTableBoundingBox: getTableBoundingBox,
    generateGraphAndEmbed: generateGraphAndEmbed,
    finalisePdf: finalisePdf,
    generatePieChartAndEmbed : generatePieChartAndEmbed,
    generateDualPieChartsAndEmbed : generateDualPieChartsAndEmbed,
    generateStackedBarChartsAndEmbed : generateStackedBarChartsAndEmbed,
    getMarginTop,
    getMarginBottom,
    getMarginLeft,
    resetCurrentPageNumber,
    createCoverPage
  };
