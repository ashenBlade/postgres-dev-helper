# Release checklist

This is simple check list for new release.

## Configurations

There tests must be performed for VS Code versions:

- 1.30 (minimal supported version)
- 1.45 (workspace.fs + Uri.joinPath)
- 1.68 (array display with length in debugger view)
- 1.90 (debugFocus API)
- latest

And all supported PostgreSQL versions (with latest minor versions):

- 12
- 13
- 14
- 15
- 16
- 17

## Check list

Schema:

```sql
CREATE TABLE tbl1(id INTEGER, value TEXT);
CREATE TABLE tbl2(id INTEGER, value TEXT);
```

Prepare:

- Run DB with logfile
- Run PSQL
- Start debugging session (F5).
- Set breakpoint to `src/backend/optimizer/plan/planner.c:subquery_planner`
  at the end of function (at `return`)
- Run `SELECT tbl1.id, MAX(tbl2.value) FROM tbl1 JOIN tbl2 ON tbl1.id = tbl2.id GROUP BY tbl1.id;`

Checks:

| Test                 | Steps                                                                                                                   | Expected                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Cast to real Tag     | `final_rel->cheapest_total_path`                                                                                        | Not plain Path - AggPath with inner MergePath (or something another)     |
| Special array member | `root->simple_rel_array`                                                                                                | Array of 4 elements: NULL, x1, x2, NULL                                  |
| Bitmapset            | `root->all_baserels`                                                                                                    | Bitmapset with 2 elements: 1, 2                                          |
| List                 | `root->processed_tlist`                                                                                                 | List with 2 TargetEntry element: Var and Aggref                          |
| Refresh variables    | Click refresh button in view                                                                                            | Variables have not changed but refresh in noticeable                     |
| pprint               | `root`, context menu, 'Dump Node to stdout'                                                                             | Node must be shown in log file                                           |
| Create config file   | Delete config file (if exists), run task `PgSQL: Open or create configuration file` and click 'Yes'                     | File `pgsql_hacker_helper.json` created in `.vscode` folder              |
| Open config file     | Create config file (if not exists), make changes and run task `PgSQL: Open or create configuration file`                | Opened config file has same values as changed version                    |
| Update config file   | Open default config file, add 2 alias types and 1 array special member and run task `PgSQL: Refresh configuration file` | In log must be message about adding 1 array special member and 2 aliases |
