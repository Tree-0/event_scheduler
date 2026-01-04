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