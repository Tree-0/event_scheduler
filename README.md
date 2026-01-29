# Event Scheduler
- Input various lists of events and constraints for those events
- Choose a CP-SAT model to optimize the placement of your events in a window
- Send the optimally scheduled events to Google Calendar via the API

```
event_scheduler/
  adapters/
    json_io.py              # load/save test cases
    gcal_io.py              # api interface -- google calendar read/write
    event_timeline.py       # simple visualization tool

  config/
    config.py               # settings and values for running the program
    example_config.yaml

  data_models/              # dataclasses and relevant utils
    event.py
    window.py
    gcal.py
    utils.py

  opt_models/               # optimization models for different criteria and constraints
    base_scheduler.py       # interface/protocol + shared helpers
    scheduler_factory.py    # makes schedulers from particular mathematical models
    makespan.py             # v1: minimize last task completion time
    ... TODO

  tests/                    # take a guess
    ...                     #

  cli.py                    # main entrypoint
```

# Getting Started
`TODO -> steps to get google calendar api key credentials and put them in config/client_secret_*`

- Notes (need to clean up)
  - Will need a `token.json` file inside `/config/`. This will be generated when you authenticate. If you get "access token denied", you probably need to delete this folder and re-authenticate. I need to just make this file get overwritten rather than denying the token if it already exists. Lots of backlog to work through
  - Will need to look into the method google OAuth has for allowing me to authenticate another user on their behalf ... that's one thing required to get other people using this for their own calendars