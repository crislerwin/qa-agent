import { tool } from "langchain";
import { z } from "zod";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

/**
 * Google Calendar configuration
 * Requires OAuth2 credentials from Google Cloud Console
 */
export interface GoogleCalendarConfig {
    credentials?: {
        clientId: string;
        clientSecret: string;
        redirectUri: string;
    };
    refreshToken?: string;
}

/**
 * Create OAuth2 client for Google Calendar
 */
function createOAuth2Client(config: GoogleCalendarConfig): OAuth2Client {
    const credentials = config.credentials || {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        redirectUri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/oauth2callback",
    };

    const oauth2Client = new google.auth.OAuth2(
        credentials.clientId,
        credentials.clientSecret,
        credentials.redirectUri
    );

    if (config.refreshToken || process.env.GOOGLE_REFRESH_TOKEN) {
        oauth2Client.setCredentials({
            refresh_token: config.refreshToken || process.env.GOOGLE_REFRESH_TOKEN,
        });
    }

    return oauth2Client;
}

/**
 * Create a Google Meet meeting tool
 * Schedules event and generates Meet link
 */
export function createMeetingTool(config: GoogleCalendarConfig = {}) {
    return tool(
        async ({ title, dateTime, duration, attendees }) => {
            try {
                const auth = createOAuth2Client(config);
                const calendar = google.calendar({ version: "v3", auth });

                const startTime = new Date(dateTime);
                const endTime = new Date(startTime.getTime() + duration * 60000);

                const event = {
                    summary: title,
                    start: {
                        dateTime: startTime.toISOString(),
                        timeZone: "UTC",
                    },
                    end: {
                        dateTime: endTime.toISOString(),
                        timeZone: "UTC",
                    },
                    attendees: attendees.map((email) => ({ email })),
                    conferenceData: {
                        createRequest: {
                            requestId: `meet-${Date.now()}`,
                            conferenceSolutionKey: { type: "hangoutsMeet" },
                        },
                    },
                };

                const response = await calendar.events.insert({
                    calendarId: "primary",
                    requestBody: event,
                    conferenceDataVersion: 1,
                    sendUpdates: "all",
                });

                const meetLink = response.data.conferenceData?.entryPoints?.[0]?.uri || "No Meet link generated";

                return `✓ Meeting scheduled successfully!

Title: ${title}
Date/Time: ${startTime.toLocaleString()}
Duration: ${duration} minutes
Attendees: ${attendees.join(", ")}
Google Meet: ${meetLink}
Calendar Link: ${response.data.htmlLink}`;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (errorMessage.includes("credentials") || errorMessage.includes("auth")) {
                    return `⚠ Google Calendar not configured. Set up OAuth2 credentials:
1. Create project in Google Cloud Console
2. Enable Google Calendar API
3. Create OAuth2 credentials
4. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN in .env

For testing without setup, the meeting details would be:
Title: ${title}
Date/Time: ${dateTime}
Duration: ${duration} minutes
Attendees: ${attendees.join(", ")}`;
                }
                return `Error scheduling meeting: ${(error as Error).message}`;
            }
        },
        {
            name: "create_meeting",
            description: "Schedule a Google Meet meeting. Provide title, ISO date/time, duration in minutes, and attendee emails.",
            schema: z.object({
                title: z.string().describe("Meeting title"),
                dateTime: z.string().describe("Meeting date and time in ISO format (e.g., 2024-12-01T14:00:00Z)"),
                duration: z.number().default(60).describe("Duration in minutes"),
                attendees: z.array(z.string().email()).describe("Array of attendee email addresses"),
            }),
        }
    );
}

/**
 * Check calendar availability tool
 */
export function checkAvailabilityTool(config: GoogleCalendarConfig = {}) {
    return tool(
        async ({ startDate, endDate }) => {
            try {
                const auth = createOAuth2Client(config);
                const calendar = google.calendar({ version: "v3", auth });

                const response = await calendar.events.list({
                    calendarId: "primary",
                    timeMin: new Date(startDate).toISOString(),
                    timeMax: new Date(endDate).toISOString(),
                    singleEvents: true,
                    orderBy: "startTime",
                });

                const events = response.data.items || [];

                if (events.length === 0) {
                    return `✓ Fully available from ${startDate} to ${endDate}`;
                }

                const busySlots = events.map((event) => {
                    const start = new Date(event.start?.dateTime || event.start?.date || "");
                    const end = new Date(event.end?.dateTime || event.end?.date || "");
                    return `• ${start.toLocaleString()} - ${end.toLocaleString()}: ${event.summary}`;
                }).join("\n");

                return `Busy time slots from ${startDate} to ${endDate}:\n\n${busySlots}`;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (errorMessage.includes("credentials") || errorMessage.includes("auth")) {
                    return `⚠ Google Calendar not configured. Cannot check availability.\nSet up OAuth2 credentials in .env to enable this feature.`;
                }
                return `Error checking availability: ${errorMessage}`;
            }
        },
        {
            name: "check_availability",
            description: "Check calendar availability between two dates",
            schema: z.object({
                startDate: z.string().describe("Start date in ISO format"),
                endDate: z.string().describe("End date in ISO format"),
            }),
        }
    );
}

/**
 * List upcoming meetings tool
 */
export function listMeetingsTool(config: GoogleCalendarConfig = {}) {
    return tool(
        async ({ maxResults }) => {
            try {
                const auth = createOAuth2Client(config);
                const calendar = google.calendar({ version: "v3", auth });

                const response = await calendar.events.list({
                    calendarId: "primary",
                    timeMin: new Date().toISOString(),
                    maxResults,
                    singleEvents: true,
                    orderBy: "startTime",
                });

                const events = response.data.items || [];

                if (events.length === 0) {
                    return "No upcoming meetings scheduled.";
                }

                const meetingList = events.map((event, i) => {
                    const start = new Date(event.start?.dateTime || event.start?.date || "");
                    const meetLink = event.conferenceData?.entryPoints?.[0]?.uri;
                    return `${i + 1}. ${event.summary}
   Time: ${start.toLocaleString()}
   ${meetLink ? `Meet: ${meetLink}` : ""}`;
                }).join("\n\n");

                return `Upcoming meetings:\n\n${meetingList}`;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (errorMessage.includes("credentials") || errorMessage.includes("auth")) {
                    return `⚠ Google Calendar not configured. Cannot list meetings.\nSet up OAuth2 credentials in .env to enable this feature.`;
                }
                return `Error listing meetings: ${errorMessage}`;
            }
        },
        {
            name: "list_meetings",
            description: "List upcoming meetings from Google Calendar",
            schema: z.object({
                maxResults: z.number().default(10).describe("Maximum number of meetings to return"),
            }),
        }
    );
}
