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

//Misc Funcs
function secondsToMinutes(seconds) {
    seconds = parseInt(seconds, 10);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes === 0) {
        return `${seconds} seconds`;
    } else if (remainingSeconds === 0) {
        return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
        return `${minutes} minute${minutes > 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds > 1? 's' : ' '}`;
    }
}
//Misc Funcs

function getAnalyticsData(clientID, clientFile, value, startDate = '2024-01-01', endDate = '2024-01-31', make_readable = true) {
    return new Promise((resolve, reject) => {
        // Load service account (not user account) credentials from a file
        const serviceAccount = JSON.parse(fs.readFileSync(clientFile));

        // Create a JWT client using the service account credentials
        const jwtClient = new google.auth.JWT({
            email: serviceAccount.client_email,
            key: serviceAccount.private_key,
            scopes: ['https://www.googleapis.com/auth/analytics.readonly'] // Add necessary scopes
        });

        // Authenticate the JWT client
        jwtClient.authorize(async (err, tokens) => {
            if (err) {
                console.error('JWT client authorization error:', err);
                reject(err);
                return;
            }

            // Create the Analytics Data API client
            const analyticsData = google.analyticsdata({
                version: 'v1beta',
                auth: jwtClient
            });

            // Make API request to retrieve data
            analyticsData.properties.runReport({
                property: `properties/${clientID}`, //sets property ID
                requestBody: {
                    dateRanges: [{ startDate, endDate }], //sets dates
                    metrics: [{ name: value }] //sets metric name (i.e page view count)
                }
            }, (err, res) => {
                if (err) {
                    console.error('API error:', err);
                    reject(err);
                    return;
                }
                // Check if the response contains rows of data
                if (make_readable && res.data.rows && res.data.rows.length > 0) {
                    //console.log(`Debug - ${value}:`, res.data.rows[0].metricValues[0].value); // - debug option 
                    resolve(res.data.rows[0].metricValues[0].value);
                } else {
                    console.log('No data available in the response.');
                    resolve(res); // Return 0 or any default value when there is no data
                }
            });
        });
    });
}

async function getVisitorCount(clientID, clientFile, startDate = '2024-01-01', endDate = '2024-01-31') {
    const value = 'sessions';

    let visitor_count = await getAnalyticsData(clientID, clientFile, value, startDate, endDate);
    visitor_count = parseInt(visitor_count, 10); //maek sure it is int in base 10
    return visitor_count;
}

async function getPageViewCount(clientID, clientFile,startDate = '2024-01-01', endDate = '2024-01-31') {
    const value = 'screenPageViews';

    let page_view_count = await getAnalyticsData(clientID, clientFile, value, startDate, endDate);
    page_view_count = parseInt(page_view_count, 10); //make sure it is int in base 10
    return page_view_count;
}

async function getMostVisitedPages(clientID, clientFile, startDate, endDate, topN = 2) {
    try {
        const serviceAccount = JSON.parse(fs.readFileSync(clientFile));
        const jwtClient = new google.auth.JWT({
            email: serviceAccount.client_email,
            key: serviceAccount.private_key,
            scopes: ['https://www.googleapis.com/auth/analytics.readonly']
        });

        await jwtClient.authorize();
        const analyticsData = google.analyticsdata({
            version: 'v1beta',
            auth: jwtClient
        });

        const res = await analyticsData.properties.runReport({
            property: `properties/${clientID}`,
            requestBody: {
                dateRanges: [{ startDate, endDate }],
                dimensions: [{ name: 'pageTitle' }],
                metrics: [{ name: 'activeUsers' }]
            }
        });


        if (res.data.rows && res.data.rows.length > 0) {
            const totalActiveUsers = res.data.rows.reduce((acc, row) => {
                const activeUsers = row.metricValues && row.metricValues[0] && parseInt(row.metricValues[0].value, 10) || 0;
                return acc + activeUsers;
            }, 0);
            
            
            const sortedRows = res.data.rows.sort((a, b) => {
                // Correctly access and parse metric values for sorting
                const aMetricValue = a.metricValues && a.metricValues[0] && parseInt(a.metricValues[0].value, 10) || 0;
                const bMetricValue = b.metricValues && b.metricValues[0] && parseInt(b.metricValues[0].value, 10) || 0;
                return bMetricValue - aMetricValue;
            });
            
        const topNWebPageNamesWithPercentage = sortedRows.slice(0, topN).map(row => {
            // Correctly access the page name
            const pageName = row.dimensionValues && row.dimensionValues[0] && row.dimensionValues[0].value || 'Unknown Page';
            // Correctly access and parse the page views
            const pageViews = row.metricValues && row.metricValues[0] && parseInt(row.metricValues[0].value, 10) || 0;
            const percentageOfViews = totalActiveUsers > 0 ? ((pageViews / totalActiveUsers) * 100).toFixed(2) + '%' : '0%';
            return [pageName, percentageOfViews]; // Changed to return a sub-array
        });

        // Now, `topNWebPageNamesWithPercentage` is a 2D array where each sub-array contains the page name and its percentage of views.
        return topNWebPageNamesWithPercentage;

        } else {
            console.log('No data available in the response.');
            return [];
        }
    } catch (error) {
        console.error('Error retrieving analytics data:', error);
        throw error;
    }
}

async function getTimeSpent(clientID, clientFile, startDate = '2024-01-01', endDate = '2024-01-31', formatted = false){
    const value = 'averageSessionDuration';

    time_spent = await getAnalyticsData(clientID, clientFile, value, startDate, endDate);
    if (formatted == false){
        return time_spent
    }
    else{
        return secondsToMinutes(time_spent);
    }
}

async function getPercentageNewUsers(clientID, clientFile, startDate = '2024-01-01', endDate = '2024-01-31') {

    const new_users = 'newUsers';
    const total_users = 'totalUsers';

    let new_user_count = await getAnalyticsData(clientID, clientFile, new_users, startDate, endDate);
    let total_user_count = await getAnalyticsData(clientID, clientFile, total_users, startDate, endDate);
    newUserPercent = (new_user_count / total_user_count) * 100; //find the percentage
    newUserPercent = parseInt(newUserPercent, 10); //maek sure it is int in base 10
    return newUserPercent;
}

async function getLocation(clientID, clientFile, startDate = '2024-01-01', endDate = '2024-01-31') {
    const serviceAccount = JSON.parse(fs.readFileSync(clientFile));
    const jwtClient = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });

    await jwtClient.authorize();

    const analyticsData = google.analyticsdata({
        version: 'v1beta',
        auth: jwtClient
    });

    try {
        const res = await analyticsData.properties.runReport({
            property: `properties/${clientID}`,
            requestBody: {
                dimensions: [{ name: 'country' }],
                dateRanges: [{ startDate, endDate }],
                metrics: [{ name: 'sessions'}]
            }
        });
    
        if (res.data.rows && res.data.rows.length > 0) {
            // Map rows to correctly extract location and amount
            let locationData = res.data.rows.map(row => ({
                location: row.dimensionValues[0].value, // Access the correct path for dimension value
                amount: row.metricValues[0].value
            }));
        
            locationData = JSON.stringify(locationData, null, 2); // Pretty print the object
            return locationData;

        
        } else {
            console.log('No data available in the response.');
            return [];
        }
        

    } catch (error) {
        console.error('API error:', error);
        throw error;
    }
}

async function getReferralSessions(clientID, clientFile, startDate = '2024-01-01', endDate = '2024-01-31', clumpedData = true) {
    const serviceAccount = JSON.parse(fs.readFileSync(clientFile));
    const jwtClient = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });
    await jwtClient.authorize();
    const analyticsData = google.analyticsdata({
        version: 'v1beta',
        auth: jwtClient
    });
    try {
        const dimensions = clumpedData ? [{ name: 'sessionMedium' }] : [{ name: 'sessionSource' }, { name: 'sessionMedium' }];
        const res = await analyticsData.properties.runReport({
            property: `properties/${clientID}`,
            requestBody: {
                dimensions: dimensions,
                dateRanges: [{ startDate, endDate }],
                metrics: [{ name: 'sessions' }]
            }
        });
        if (res.data.rows && res.data.rows.length > 0) {
            if (clumpedData) {
                const aggregatedData = res.data.rows.reduce((acc, row) => {
                    let sessionMedium = row.dimensionValues[0].value.trim().toLowerCase();
                    sessionMedium = sessionMedium === '(none)' ? '' : sessionMedium.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                    const key = sessionMedium || 'Direct'; // Fallback for empty mediums if needed
    
                    if (!acc[key]) {
                        acc[key] = 0;
                    }
                    acc[key] += parseInt(row.metricValues[0].value);
    
                    return acc;
                }, {});
    
                return Object.entries(aggregatedData).map(([medium, count]) => [medium, count]);
            } else {
                return res.data.rows.map(row => {
                    let sessionSource = row.dimensionValues[0].value.trim();
                    // Remove brackets around "direct" but leave "direct" intact
                    sessionSource = sessionSource.replace(/\(\s*direct\s*\)/i, 'direct');
                    // Remove all other types of brackets
                    sessionSource = sessionSource.replace(/[\[\]{}]/g, '');

                    let sessionMedium = row.dimensionValues[1] ? row.dimensionValues[1].value.trim().toLowerCase() : '';
                    sessionMedium = sessionMedium === '(none)' ? '' : sessionMedium.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                    const sourceMedium = sessionMedium ? `${sessionSource} (${sessionMedium})` : sessionSource;
                    return [
                        sourceMedium,
                        parseInt(row.metricValues[0].value)
                    ];
                });
            }
        } else {
            console.log('No data available in the response.');
            return [];
        }
    } catch (error) {
        console.error('API error:', error);
        throw error;
    }
}

async function getDeviceUsage(clientID, clientFile, startDate = '2024-01-01', endDate = '2024-01-31', makeReadable) {
    const serviceAccount = JSON.parse(fs.readFileSync(clientFile));
    const jwtClient = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });
    await jwtClient.authorize();
    const analyticsData = google.analyticsdata({
        version: 'v1beta',
        auth: jwtClient
    });
    try {
        const res = await analyticsData.properties.runReport({
            property: `properties/${clientID}`,
            requestBody: {
                dimensions: [{ name: 'deviceCategory' }], // Change dimension to deviceCategory
                dateRanges: [{ startDate, endDate }],
                metrics: [{ name: 'sessions' }]
            }
        });
        if (res.data.rows && res.data.rows.length > 0) {
            // Map rows to extract device type and amount
            const deviceData = res.data.rows.map(row => ({
                deviceType: row.dimensionValues[0].value,
                userCount: row.metricValues[0].value
            }));
            return deviceData;
        } else {
            console.log('No data available in the response.');
            return [];
        }
    } catch (error) {
        console.error('API error:', error);
        throw error;
    }
}

async function getBrowserUsage(clientID, clientFile, startDate = '2024-01-01', endDate = '2024-01-31', makeReadable = false) {
    const serviceAccount = JSON.parse(fs.readFileSync(clientFile));
    const jwtClient = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });
    await jwtClient.authorize();
    const analyticsData = google.analyticsdata({
        version: 'v1beta',
        auth: jwtClient
    });
    try {
        const res = await analyticsData.properties.runReport({
            property: `properties/${clientID}`,
            requestBody: {
                dimensions: [{ name: 'browser' }], // Changed dimension to browser
                dateRanges: [{ startDate, endDate }],
                metrics: [{ name: 'sessions' }]
            }
        });
        if (res.data.rows && res.data.rows.length > 0) {
            // Map rows to extract browser type and amount
            const browserData = res.data.rows.map(row => ({
                browserType: row.dimensionValues[0].value,
                userCount: row.metricValues[0].value
            }));
            return browserData;
        } else {
            console.log('No data available in the response.');
            return [];
        }
    } catch (error) {
        console.error('API error:', error);
        throw error;
    }
}

async function getGender(clientID, clientFile, startDate = '2024-01-01', endDate = '2024-01-31') {
    const serviceAccount = JSON.parse(fs.readFileSync(clientFile));
    const jwtClient = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });

    await jwtClient.authorize();

    const analyticsData = google.analyticsdata({
        version: 'v1beta',
        auth: jwtClient
    });

    try {
        const res = await analyticsData.properties.runReport({
            property: `properties/${clientID}`,
            requestBody: {
                dimensions: [{ name: 'userGender' }],
                dateRanges: [{ startDate, endDate }],
                metrics: [{ name: 'activeUsers' }],
            }
        });

        const genderCounts = {};
        if (res.data.rows && res.data.rows.length > 0) {
            res.data.rows.forEach(row => {
                const gender = row.dimensionValues[0].value || 'Unknown Gender';
                const userCount = parseInt(row.metricValues[0].value, 10);
                if (!genderCounts[gender]) {
                    genderCounts[gender] = 0;
                }
                genderCounts[gender] += userCount;
            });
        } else {
            console.log('No data available for the specified date range.');
            return 'No data available.';
        }
        return genderCounts;
    } catch (error) {
        console.error('Error fetching analytics data:', error);
        throw error;
    }
}

async function getAge(clientID, clientFile, startDate = '2024-01-01', endDate = '2024-01-31') {
    const serviceAccount = JSON.parse(fs.readFileSync(clientFile));
    const jwtClient = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });

    await jwtClient.authorize();

    const analyticsData = google.analyticsdata({
        version: 'v1beta',
        auth: jwtClient
    });

    try {
        const res = await analyticsData.properties.runReport({
            property: `properties/${clientID}`,
            requestBody: {
                dimensions: [{ name: 'userAgeBracket' }],
                dateRanges: [{ startDate, endDate }],
                metrics: [{ name: 'activeUsers' }],
            }
        });

        const ageCounts = {};
        if (res.data.rows && res.data.rows.length > 0) {
            res.data.rows.forEach(row => {
                const ageBracket = row.dimensionValues[0].value || 'Unknown Age Bracket';
                const userCount = parseInt(row.metricValues[0].value, 10);
                if (!ageCounts[ageBracket]) {
                    ageCounts[ageBracket] = 0;
                }
                ageCounts[ageBracket] += userCount;
            });
        } else {
            console.log('No age data available for the specified date range.');
            return 'No data available.';
        }
        return ageCounts;
    } catch (error) {
        console.error('Error fetching analytics age data:', error);
        throw error;
    }
}

async function getLanguageData(clientID, clientFile, startDate = '2024-01-01', endDate = '2024-01-31') {
    const serviceAccount = JSON.parse(fs.readFileSync(clientFile));
    const jwtClient = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });

    await jwtClient.authorize();

    const analyticsData = google.analyticsdata({
        version: 'v1beta',
        auth: jwtClient
    });

    try {
        const res = await analyticsData.properties.runReport({
            property: `properties/${clientID}`,
            requestBody: {
                dimensions: [{ name: 'language' }],
                dateRanges: [{ startDate, endDate }],
                metrics: [{ name: 'activeUsers' }],
            }
        });

        const languageCounts = {};
        if (res.data.rows && res.data.rows.length > 0) {
            res.data.rows.forEach(row => {
                const language = row.dimensionValues[0].value || 'Unknown Language';
                const userCount = parseInt(row.metricValues[0].value, 10);
                if (!languageCounts[language]) {
                    languageCounts[language] = 0;
                }
                languageCounts[language] += userCount;
            });
        } else {
            console.log('No data available for the specified date range.');
            return 'No data available.';
        }
        return languageCounts;
    } catch (error) {
        console.error('Error fetching analytics data:', error);
        throw error;
    }
}

async function getConversionReferralData(clientID, clientFile, startDate = '2024-01-01', endDate = '2024-01-31', clumpedData = true, conversionMetric = 'goalCompletionsAll') {
    const fs = require('fs');
    const {google} = require('googleapis');

    const serviceAccount = JSON.parse(fs.readFileSync(clientFile));
    const jwtClient = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });
    await jwtClient.authorize();
    const analyticsData = google.analyticsdata({
        version: 'v1beta',
        auth: jwtClient
    });
    try {
        const dimensions = clumpedData ? [{ name: 'sessionMedium' }] : [{ name: 'sessionSource' }, { name: 'sessionMedium' }];
        const res = await analyticsData.properties.runReport({
            property: `properties/${clientID}`,
            requestBody: {
                dimensions: dimensions,
                dateRanges: [{ startDate, endDate }],
                metrics: [{ name: 'transactions' }] // For e-commerce transactions
            }
        });
        if (res.data.rows && res.data.rows.length > 0) {
            if (clumpedData) {
                const aggregatedData = res.data.rows.reduce((acc, row) => {
                    let sessionMedium = row.dimensionValues[0].value.trim().toLowerCase();
                    sessionMedium = sessionMedium === '(none)' ? '' : sessionMedium.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                    const key = sessionMedium || 'Direct'; // Fallback for empty mediums if needed
    
                    if (!acc[key]) {
                        acc[key] = 0;
                    }
                    acc[key] += parseInt(row.metricValues[0].value);
    
                    return acc;
                }, {});
    
                return Object.entries(aggregatedData).map(([medium, count]) => [medium, count]);
            } else {
                return res.data.rows.map(row => {
                    let sessionSource = row.dimensionValues[0].value.trim();
                    sessionSource = sessionSource.replace(/\(\s*direct\s*\)/i, 'direct');
                    sessionSource = sessionSource.replace(/[\[\]{}]/g, '');

                    let sessionMedium = row.dimensionValues[1] ? row.dimensionValues[1].value.trim().toLowerCase() : '';
                    sessionMedium = sessionMedium === '(none)' ? '' : sessionMedium.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                    const sourceMedium = sessionMedium ? `${sessionSource} (${sessionMedium})` : sessionSource;
                    return [
                        sourceMedium,
                        parseInt(row.metricValues[0].value)
                    ];
                });
            }
        } else {
            console.log('No data available in the response.');
            return [];
        }
    } catch (error) {
        console.error('API error:', error);
        throw error;
    }
} //NO data usually as far as i can tell


async function getConversionData(clientID, clientFile, startDate = '2024-01-01', endDate = '2024-01-31') {
    const serviceAccount = JSON.parse(fs.readFileSync(clientFile));
    const jwtClient = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });

    await jwtClient.authorize();

    const analyticsData = google.analyticsdata({
        version: 'v1beta',
        auth: jwtClient
    });

    try {
        const res = await analyticsData.properties.runReport({
            property: `properties/${clientID}`,
            requestBody: {
                dimensions: [{ name: 'language' }],
                dateRanges: [{ startDate, endDate }],
                metrics: [{ name: 'transactions' }], // Changed metric to 'transactions'
            }
        });

        const transactionCounts = {}; // Adjusted variable name for clarity
        if (res.data.rows && res.data.rows.length > 0) {
            res.data.rows.forEach(row => {
                const language = row.dimensionValues[0].value || 'Unknown Language';
                const transactionCount = parseInt(row.metricValues[0].value, 10); // Adjusted variable name for clarity
                if (!transactionCounts[language]) {
                    transactionCounts[language] = 0;
                }
                transactionCounts[language] += transactionCount;
            });
        } else {
            console.log('No data available for the specified date range.');
            return 'No data available.';
        }
        return transactionCounts;
    } catch (error) {
        console.error('Error fetching analytics data:', error);
        throw error;
    }
} //NO data usually as far as i can tell

async function getReferralBounceRate(clientID, clientFile, startDate = '2024-01-01', endDate = '2024-01-31', clumpedData = true) {
    const serviceAccount = JSON.parse(fs.readFileSync(clientFile));
    const jwtClient = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });
    await jwtClient.authorize();
    const analyticsData = google.analyticsdata({
        version: 'v1beta',
        auth: jwtClient
    });
    try {
        const dimensions = clumpedData ? [{ name: 'sessionMedium' }] : [{ name: 'sessionSource' }, { name: 'sessionMedium' }];
        const res = await analyticsData.properties.runReport({
            property: `properties/${clientID}`,
            requestBody: {
                dimensions: dimensions,
                dateRanges: [{ startDate, endDate }],
                metrics: [{ name: 'bounceRate' }]
            }
        });
        if (res.data.rows && res.data.rows.length > 0) {
            if (clumpedData) {
                const aggregatedData = res.data.rows.reduce((acc, row) => {
                    let sessionMedium = row.dimensionValues[0].value.trim().toLowerCase();
                    sessionMedium = sessionMedium === '(none)' ? '' : sessionMedium.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                    const key = sessionMedium || 'Direct'; // Fallback for empty mediums if needed
    
                    if (!acc[key]) {
                        acc[key] = 0;
                    }
                    acc[key] += parseFloat((row.metricValues[0].value * 100).toFixed(2)); // Handling as float since bounce rate is a percentage
                    return acc;
                }, {});
    
                return Object.entries(aggregatedData).map(([medium, rate]) => [medium, rate]);
            } else {
                return res.data.rows.map(row => {
                    let sessionSource = row.dimensionValues[0].value.trim();
                    sessionSource = sessionSource.replace(/\(\s*direct\s*\)/i, 'direct');
                    sessionSource = sessionSource.replace(/[\[\]{}]/g, '');

                    let sessionMedium = row.dimensionValues[1] ? row.dimensionValues[1].value.trim().toLowerCase() : '';
                    sessionMedium = sessionMedium === '(none)' ? '' : sessionMedium.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                    const sourceMedium = sessionMedium ? `${sessionSource} (${sessionMedium})` : sessionSource;
                    return [
                        sourceMedium,
                        parseFloat(row.metricValues[0].value) // Handling as float since bounce rate is a percentage
                    ];
                });
            }
        } else {
            console.log('No data available in the response.');
            return [];
        }
    } catch (error) {
        console.error('API error:', error);
        throw error;
    }
}

async function getScrollDepth(clientID, clientFile, startDate = '2024-01-01', endDate = '2024-01-31', clumpedData = true) {
    const serviceAccount = JSON.parse(fs.readFileSync(clientFile));
    const jwtClient = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });
    await jwtClient.authorize();
    const analyticsData = google.analyticsdata({
        version: 'v1beta',
        auth: jwtClient
    });
    try {
        const dimensions = clumpedData ? [{ name: 'sessionMedium' }] : [{ name: 'sessionSource' }, { name: 'sessionMedium' }];
        const res = await analyticsData.properties.runReport({
            property: `properties/${clientID}`,
            requestBody: {
                dimensions: dimensions,
                dateRanges: [{ startDate, endDate }],
                metrics: [{ name: 'scrolledUsers' }]
            }
        });
        if (res.data.rows && res.data.rows.length > 0) {
            if (clumpedData) {
                const aggregatedData = res.data.rows.reduce((acc, row) => {
                    let sessionMedium = row.dimensionValues[0].value.trim().toLowerCase();
                    sessionMedium = sessionMedium === '(none)' ? '' : sessionMedium.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                    const key = sessionMedium || 'Direct'; // Fallback for empty mediums if needed
    
                    if (!acc[key]) {
                        acc[key] = 0;
                    }
                    acc[key] += parseInt(row.metricValues[0].value); // Handling as integer since scrolledUsers is a count
    
                    return acc;
                }, {});
    
                return Object.entries(aggregatedData).map(([medium, count]) => [medium, count]);
            } else {
                return res.data.rows.map(row => {
                    let sessionSource = row.dimensionValues[0].value.trim();
                    sessionSource = sessionSource.replace(/\(\s*direct\s*\)/i, 'direct');
                    sessionSource = sessionSource.replace(/[\[\]{}]/g, '');

                    let sessionMedium = row.dimensionValues[1] ? row.dimensionValues[1].value.trim().toLowerCase() : '';
                    sessionMedium = sessionMedium === '(none)' ? '' : sessionMedium.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                    const sourceMedium = sessionMedium ? `${sessionSource} (${sessionMedium})` : sessionSource;
                    return [
                        sourceMedium,
                        parseInt(row.metricValues[0].value) // Handling as integer since scrolledUsers is a count
                    ];
                });
            }
        } else {
            console.log('No data available in the response.');
            return [];
        }
    } catch (error) {
        console.error('API error:', error);
        throw error;
    }
} //users that scrolled more than 90% of the page

async function getNormalisedScrollDepth(clientID, clientFile, startDate = '2024-01-01', endDate = '2024-01-31', clumpedData = true) {
    const fs = require('fs');
    const {google} = require('googleapis');
    
    const serviceAccount = JSON.parse(fs.readFileSync(clientFile));
    const jwtClient = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });
    await jwtClient.authorize();
    const analyticsData = google.analyticsdata({
        version: 'v1beta',
        auth: jwtClient
    });
    try {
        const dimensions = clumpedData ? [{ name: 'sessionMedium' }] : [{ name: 'sessionSource' }, { name: 'sessionMedium' }];
        const res = await analyticsData.properties.runReport({
            property: `properties/${clientID}`,
            requestBody: {
                dimensions: dimensions,
                metrics: [{ name: 'scrolledUsers' }, { name: 'sessions' }],
                dateRanges: [{ startDate, endDate }],
            }
        });
        if (res.data.rows && res.data.rows.length > 0) {
            const data = res.data.rows
            .map(row => {
                let sessionInfo = clumpedData ? row.dimensionValues[0].value.trim().toLowerCase() : row.dimensionValues.map(dv => dv.value.trim().toLowerCase()).join(' ');
                sessionInfo = sessionInfo === '(none)' ? 'Direct' : sessionInfo;
                
                if (sessionInfo === '(not set)') return null;
        
                const scrolledUsers = parseInt(row.metricValues[0].value);
                const totalSessions = parseInt(row.metricValues[1].value);
                const scrollRate = (scrolledUsers / totalSessions) * 100;
                
                return [sessionInfo, parseFloat(scrollRate.toFixed(2))]; // Convert to array format
            })
            .filter(row => row !== null)
            .sort((a, b) => b[1] - a[1]); // Sort based on scrollRate, which is the second item in the array

            if (clumpedData) {
                // Aggregate data if needed, this part remains unchanged as it depends on your specific requirements
            }

            return data;
        } else {
            console.log('No data available in the response.');
            return [];
        }
    } catch (error) {
        console.error('API error:', error);
        throw error;
    }
}



// async function main(){
//     test = await getScrollDepth('353217183', 'apiFiles/testanalyticsreportingapi-b4897dac5e12.json');
//     console.log(test[0])
//     console.log(test[2])
// }

// main();


module.exports = {
    getAnalyticsData,
    getVisitorCount,
    getPageViewCount,
    getMostVisitedPages,
    getTimeSpent,
    getPercentageNewUsers,
    getLocation,
    getReferralSessions,
    getBrowserUsage,
    getDeviceUsage,
    getGender,
    getAge,
    getLanguageData,
    getReferralBounceRate,
    getScrollDepth,
    getNormalisedScrollDepth

};
