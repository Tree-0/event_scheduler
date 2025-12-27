scheduler/
  data_models/              # dataclasses: Event, Window, Request, Result
    event.py
    window.py
    request.py
    result.py

  scheduler.py              # EventScheduler orchestrator

  opt_models/
    base.py                 # interface/protocol + shared helpers
    makespan.py             # v1: minimize makespan
    balance_workload.py     # 
    discomfort.py           # 
    etc.

  adapters/
    json_io.py              # load/save test cases
    gcal.py                 # google calendar read/write (later)

  tests/                    #
    ...                     #

  cli.py                    # main entrypoint
