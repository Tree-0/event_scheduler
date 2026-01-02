# Event Scheduler
- Input various lists of events and constraints for those events
- Choose a CP-SAT model to optimize the placement of your events in a window
- Send the optimally scheduled events to Google Calendar via the API

```
scheduler/
  config/
    config.py
    example_config.yaml

  data_models/              # dataclasses: Event, Window, Request, Result
    event.py
    window.py
    utils.py

  opt_models/
    base.py                 # interface/protocol + shared helpers
    makespan.py             # v1: minimize makespan
    etc; other schedulers...
    
  adapters/
    json_io.py              # load/save test cases
    gcal.py                 # TODO: google calendar read/write
    event_timeline.py       # simple visualization tool

  tests/                    #
    ...                     #

  cli.py                    # main entrypoint
```

# Getting Started
`TODO -> steps to get google calendar api key credentials and put them in config/client_secret_*`