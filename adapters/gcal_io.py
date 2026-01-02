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
        self.SCOPES = ["https://www.googleapis.com/auth/calendar.events.owned"]
        
        self.__credentials = self.__get_credentials()
        if not self.__credentials:
            raise ValueError("Unable to get credentials for from gcal API upon GoogleCalendarIO init")

    # Not sure how many of these methods will be necessary, and some will probably be redesigned

    def send_event_to_calendar(calendar_id: str, event: GoogleCalendarEvent) -> bool:
        pass

    def send_events_to_calendar(calendar_id: str, events: List[GoogleCalendarEvent]) -> bool:
        pass

    def sync_google_calendar(calendar: GoogleCalendar) -> bool:
        # get id from obj, write all events to the calendar if they are not already there?
        
        # find way to do it such that we minimize the amount of the api quota we use
        pass

    def read_google_calendar(calendar_id: str, ) -> bool:
        pass

    def __get_all_calendars() -> List[GoogleCalendar]:
        
        
        pass

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