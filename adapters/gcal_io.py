# class to interface with the google calendar API, sending events back and forth

import datetime
import json
import os.path
from typing import List
import sys
from pathlib import Path

# Allow running this file directly (python adapters/gcal_io.py) by adding project root to sys.path
if __package__ in (None, ""):
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from data_models.gcal import GoogleCalendarEvent, GoogleCalendar

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

class GoogleCalendarIO:
    def __init__(self):
        self.SCOPES = [
            "https://www.googleapis.com/auth/calendar.events.owned", 
            "https://www.googleapis.com/auth/calendar"
        ]
        
        self.__credentials = self.__get_credentials()
        if not self.__credentials:
            raise ValueError("Unable to get credentials for from gcal API upon GoogleCalendarIO init")

    # Not sure how many of these methods will be necessary, and some will probably be redesigned

    # TODO: return bool or just event_result? what is event_result type, dict?
    def send_event_to_calendar(self, calendar_id: str, event: GoogleCalendarEvent):
        try:
            service = build("calendar", "v3", credentials=self.__credentials)
            
            event = {
                'summary': event.summary,
                'description': event.description,
                'start': {
                    'dateTime': event.start_dt.isoformat(),
                    'timeZone': 'America/Chicago',
                },
                'end': {
                    'dateTime': event.end_dt.isoformat(),
                    'timeZone': 'America/Chicago',
                },
            }
            
            event_result = service.events().insert(calendarId=calendar_id, body=event).execute()

            return event_result
        
        except Exception as e:
            print(e)
            return False

    # TODO: look into batching? This would not save on API quota, and network overhead is probably not going to ever be a bottleneck,
    # so might not be a big deal.
    def send_events_to_calendar(self, calendar_id: str, events: List[GoogleCalendarEvent]) -> bool:
        for event in events:
            try:
                self.send_event_to_calendar(calendar_id, event)
            except Exception as e:
                print(e)
                continue

    def sync_google_calendar(calendar: GoogleCalendar) -> bool:
        # get id from obj, write all events to the calendar if they are not already there?
        
        # find way to do it such that we minimize the amount of the api quota we use
        pass

    def read_google_calendar(calendar_id: str, ) -> bool:
        pass

    # TODO: consider... do I really need custom GoogleCalendar and GoogleCalendarEvent objects,
    # or do the objects returned by the resource builder work well enough such that my custom
    # objects are redundant? 
    def get_all_calendars(self):
        # get all of the authenticated user's calendars
        try:
            service = build("calendar", "v3", credentials=self.__credentials)

            print("Getting calendars...")
            result = (service.calendarList().list()).execute()

            for cal in result.get('items', []):
                print(cal['summary'])
                print('     ' + cal['id'])
                print('     ' + cal['accessRole'])
            
            return result

        except Exception as e:
            print(e)
    
    def get_calendar_events(self, after_dt: datetime, calendar_id: str, limit=100):
        # get the events from a particular calendar after a date
        try:
            service = build("calendar", "v3", credentials=self.__credentials)

            # str format for request body
            dt = after_dt.isoformat()
            
            print(f"Getting events from {calendar_id} after {after_dt.isoformat()}")
            events_result = (
                service.events()
                .list(
                    calendarId=calendar_id,
                    timeMin=dt,
                    maxResults=limit,
                    singleEvents=True,
                    orderBy="startTime",
                )
                .execute()
            )
            events = events_result.get("items", [])

            if not events:
                print("No upcoming events found.")
                return []
            
            return events
        
        except Exception as e:
            print(e)
            return []

    # Modified starter code taken from quickstart documentation of google calendar API
    def __get_credentials(self) -> Credentials:
        creds = None
        # The file token.json stores the user's access and refresh tokens, and is
        # created automatically when the authorization flow completes for the first
        # time.
        token_path = "config/token.json"
        secret_path = "config/client_secret.json"

        if os.path.exists(token_path):
            creds = Credentials.from_authorized_user_file(token_path, self.SCOPES)

        # If there are no (valid) credentials available, let the user log in
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(
                    secret_path, self.SCOPES
                )
                creds = flow.run_local_server(port=0)

            # Save the credentials for future runs
            with open(token_path, "w") as token:
                token.write(creds.to_json())
        
        return creds

if __name__ == "__main__":
    gcal_io = GoogleCalendarIO()
    result = gcal_io.get_all_calendars()
    [print(item["summary"]) for item in result.get("items", [])]
    
    first_cal = result["items"][3]["id"]
    
    now = datetime.datetime.now(tz=datetime.timezone.utc)
    events = gcal_io.get_calendar_events(now, first_cal, 10)

    for event in events:
        print(event["summary"])
        #print(f"    {event['start']['dateTime']} - {event['end']['dateTime']}")
        print(f"    {event['start']} - {event['end']}")
        print(type(event['start']))

    test_event = GoogleCalendarEvent(
        id='', summary="TEST EVENT API INSERT",
        description="TEST DESCRIPTION",
        start_dt = datetime.datetime.now(tz=datetime.timezone.utc),
        end_dt = datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(hours=2)
    )

    print("sending test event to calendar ", first_cal)
    insert_event_result = gcal_io.send_event_to_calendar(first_cal, test_event)

    print(insert_event_result)


