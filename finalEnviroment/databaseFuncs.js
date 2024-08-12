//Imports
const { header } = require('express/lib/request');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const puppeteer = require('puppeteer');
const { google } = require('googleapis');
const mysql = require('mysql');
const util = require('util');
//Imports



// Database Config
    const connection = mysql.createConnection({
        host: 'mysql.addns.co.uk',
        port: 3306,
        user: 'example-user', //redacted for public-purposes
        password: 'example-password', //redacted for public-purposes
        database: 'example-database' //redacted for public-purposes
    });

    const query = util.promisify(connection.query).bind(connection);

    function openConnection() {
        if (connection.state === 'disconnected') {
            connection.connect(error => {
                if (error) throw error;
                console.log("MySQL connected successfully.\n");
            });
        }
    }

    function closeConnection() {
        return new Promise((resolve, reject) => {
            if (connection.state !== 'disconnected') {
                connection.end(err => {
                    if (err) {
                        console.error("Error closing MySQL connection:", err);
                        reject(err); // Reject the promise on error
                    } else {
                        console.log("MySQL connection closed.");
                        resolve(); // Resolve the promise when the connection is closed
                    }
                });
            } else {
                resolve(); // Resolve immediately if the connection is already disconnected
            }
        });
    }
    
    function queryAsync(query, params) { // Wrapper function to use Promises with the MySQL query function
        return new Promise((resolve, reject) => {
            connection.query(query, params, (error, results) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(results);
                }
            });
        });
    }
// Database Config



// Database Fake 'API' calls
    async function getMetricDataById(metricId) {
        openConnection(); // Ensure connection is open

        const query = 'SELECT metric_data FROM Metric WHERE metric_id = ?';
        try {
            const results = await queryAsync(query, [metricId]);
            if (results.length > 0) {
                return results[0].metric_data; // Assuming metric_data is directly accessible
            } else {
                console.log('No data found for metric_id:', metricId);
                return null; // Or appropriate handling
            }
        } catch (error) {
            console.error('Error querying Metric data:', error);
            throw error; // Or appropriate error handling
        } finally {
            //closeConnection(); // Close connection if it's a one-off operation
        }
    }

    async function getMetricDataByName(metricName) {
        openConnection(); // Ensure connection is open

        const query = 'SELECT metric_data FROM Metric WHERE metric_name = ?';
        try {
            const results = await queryAsync(query, [metricName]); // Use metricName in the query
            if (results.length > 0) {
                return results[0].metric_data; // Assuming metric_data is directly accessible
            } else {
                console.log('No data found for metric_name:', metricName); // Correct the log message to reflect metric_name
                return null; // Or appropriate handling
            }
        } catch (error) {
            console.error('Error querying Metric data:', error);
            throw error; // Or appropriate error handling
        } finally {
            //closeConnection(); // Close connection if it's a one-off operation
        }
    }

    async function getChosenValueAsBoolean(metricName) {
        openConnection(); // Ensure connection is open

        const query = 'SELECT chosen FROM Metric WHERE metric_name = ?';
        try {
            const results = await queryAsync(query, [metricName]); // Use metricName in the query
            if (results.length > 0) {
                return results[0].chosen === 1; // Return true if chosen is 1, false otherwise
            } else {
                console.log('No data found for metric_name:', metricName); // Log message for no data found
                return false; // Return false or null based on how you want to handle no data found scenario
            }
        } catch (error) {
            console.error('Error querying Metric data:', error);
            throw error; // Or appropriate error handling
        } finally {
            //closeConnection(); // Close connection if it's a one-off operation
        }
    }

    async function getReportDatesById(reportId) {
        openConnection(); // Ensure connection is open

        const query = 'SELECT start_date, end_date FROM Report WHERE report_id = ?';
        try {
            const results = await queryAsync(query, [reportId]); // Use reportId in the query
            if (results.length > 0) {
                return {
                    startDate: results[0].start_date,
                    endDate: results[0].end_date
                }; // Return both start and end dates
            } else {
                console.log('No report found for report_id:', reportId);
                return null; // Or appropriate handling for no report found
            }
        } catch (error) {
            console.error('Error querying Report dates:', error);
            throw error; // Or appropriate error handling
        } finally {
            //closeConnection(); // Close connection if it's a one-off operation
        }
    }

    async function getSegmentPageNumberByName(segmentName) {
        openConnection(); // Ensure connection is open

        const query = 'SELECT page_number FROM Segment WHERE segment_name = ?';
        try {
            const results = await queryAsync(query, [segmentName]); // Use metricName in the query
            if (results.length > 0) {
                return results[0].page_number; 
            } else {
                console.log('No data found for segment_name:', segmentName); // Correct the log message to reflect metric_name
                return null; 
            }
        } catch (error) {
            console.error('Error querying Metric data:', error);
            throw error; 
        } finally {
            //closeConnection(); // Close connection if it's a one-off operation
        }
    }

    async function getSegmentHeightByID(segmentID) {
        openConnection(); // Ensure connection is open

        const query = 'SELECT height FROM Segment WHERE segment_id = ?';
        try {
            const results = await queryAsync(query, [segmentID]); // Use metricName in the query
            if (results.length > 0) {
                return results[0].height; 
            } else {
                console.log('No data found for segment_name:', segmentID); // Correct the log message to reflect metric_name
                return null; 
            }
        } catch (error) {
            console.error('Error querying Metric data:', error);
            throw error; 
        } finally {
            //closeConnection(); // Close connection if it's a one-off operation
        }
    }

    async function setSegmentPageNumberByID(segmentID, pageNumber) {
        openConnection(); // Ensure connection is open
    
        const query = 'UPDATE Segment SET page_number = ? WHERE segment_id = ?';
        try {
            const result = await queryAsync(query, [pageNumber, segmentID]);
            if (result.affectedRows > 0) {
                //pass - means it is working
            } else {
                console.log('No data found for segment_id:', segmentID);
                return null;
            }
        } catch (error) {
            console.error('Error updating Segment data:', error);
            throw error;
        } finally {
            //closeConnection(); // Close connection if it's a one-off operation or leave open if it's managed elsewhere
        }
    }

    async function setSegmentPositionByID(segmentID, position) {
        openConnection(); // Ensure connection is open
    
        const query = 'UPDATE Segment SET position = ? WHERE segment_id = ?';
        try {
            const result = await queryAsync(query, [position, segmentID]);
            if (result.affectedRows > 0) {
                //pass - means it is working
            } else {
                console.log('No data found for segment_id:', segmentID);
                return null;
            }
        } catch (error) {
            console.error('Error updating Segment data:', error);
            throw error;
        } finally {
            //closeConnection(); // Close connection if it's a one-off operation or leave open if it's managed elsewhere
        }
    }

    async function setReportInfoByID(reportID, clientID, report_name, report_website) {
        //openConnection(); // Ensure connection is open
    
        const query = 'UPDATE Report SET clientID = ?, report_name = ?, report_website = ? WHERE report_id = ?';
        try {
            const result = await queryAsync(query, [clientID, report_name, report_website, reportID]);
            if (result.affectedRows > 0) {
                //pass
            } else {
                console.log('No data found for reportID:', reportID);
                return null;
            }
        } catch (error) {
            console.error('Error updating Report data:', error);
            throw error;
        } finally {
            //closeConnection(); // Close connection if it's a one-off operation or leave open if it's managed elsewhere
        }
    }

    async function getReportWebsite() {
        try {
            // Query to select the report_website value from the Report table
            const query = `SELECT report_website FROM Report LIMIT 1`; // Adjust based on how many you're expecting
            const results = await queryAsync(query);

            if (results.length > 0) {
                // Assuming the first result is what we're after
                const reportWebsite = results[0].report_website;
                return reportWebsite;
            } else {
                console.log("No report website found.");
                return ""; // Return an empty string if no results
            }
        } catch (error) {
            console.error('An error occurred:', error);
            return ""; // Return an empty string in case of error
        }
    }

    async function getReportName() {
        try {
            // Query to select the report_name value from the Report table
            const query = `SELECT report_name FROM Report LIMIT 1`; // Adjust based on how many you're expecting
            const results = await queryAsync(query);
    
            if (results.length > 0) {
                // Assuming the first result is what we're after
                const reportName = results[0].report_name;
                return reportName;
            } else {
                console.log("No report name found.");
                return ""; // Return an empty string if no results
            }
        } catch (error) {
            console.error('An error occurred:', error);
            return ""; // Return an empty string in case of error
        }
    }
    
// Database Fake 'API' calls



// Database reset
const reset_database = async () => {
    try {
        openConnection();
        // Reset chosen and position columns in the Segment table
        await query('UPDATE Segment SET chosen = NULL, position = NULL, height = NULL, page_number = NULL');

        // Reset metric_data and chosen columns in the Metric table
        await query('UPDATE Metric SET metric_data = "", chosen = NULL');

        //Re-set variables that are not set with API's
        await query(`UPDATE Metric SET metric_data = "2024-03-01, 2024-04-01", chosen = 1 WHERE metric_id = 15`);
        await query(`UPDATE Metric SET metric_data = "Place holder summary - this needs to be overwritten with *custom content from the user*, entered via the *front end*", chosen = 1 WHERE metric_id = 16`);
        
        // Reset the Report with id = 1 to default values, if needed
        // await query('UPDATE Report SET clientID = "", start_date = "0000-00-00", end_date = "0000-00-00", report_name = "", report_website = "" WHERE report_id = 1');

        console.log('Database reset successfully.');
        
    } catch (error) {
        console.error('Error resetting database:', error);
    } finally {
        //closeConnection(); // Ensure connection is closed
    }
};

// Database reset


module.exports = {
    openConnection,
    closeConnection,
    queryAsync,
    getMetricDataById,
    getMetricDataByName,
    getChosenValueAsBoolean,
    getReportDatesById,
    getSegmentPageNumberByName,
    reset_database,
    getSegmentHeightByID,
    setSegmentPageNumberByID,
    setSegmentPositionByID,
    setReportInfoByID,
    getReportWebsite,
    getReportName
  };
