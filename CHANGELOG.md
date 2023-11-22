# Change Log

## v2.0.6 - 2.0.7
- Update coins after transaction completes
- Improve some log messages
- ESHandler: Add options and requestType

## v2.0.4 - 2.0.5
- Packaging configuration fixes 

## v2.0.3
- Update tsconfig.json to compile to js files too

## v2.0.2
- Merge pull request #96 from MystenLabs/tzalex/95-handle-gasbalancetoolow-edge-case (d194cdb)
- Improve tests - minor fixes (ae5113b)
- Revert to using two splitCoins instead of one (0837848)
- Only smash coins when needed (37f061e)
- Refactor: Use only one txb.splitCoins instead of two (ddbbb8a)
- Fix: Use await when calling smashCoins (8e8d969)
- SmashCoins: Add another try-catch block (50a6470)
- Include more logs to debug tests (652cd77)
- Move helper constructor to the top of tests (c1f8f8a)
- Create splitStrategies.ts (760c347)
- Create setupTestsHelper.smashCoins for gas coin reset (368571c)

## v2.0.1
- minor fixes

## v2.0.0
- Renamed library to `suioop` (Sui Owned Object Pools)
- Refactor test logic to be isolated from the main library
- Introduction of logging library to standardize logs 
- Refactor logic in `getAWorker` function to remove busy wait

## v1.0.5
- Fixed bug about Immutable object handling
- Fixed bug about worker status update

## v1.0.4
- Performance enhancement with Lazy load the Pool objects only when needed.
- Added flowchart to README.md

## v1.0.3
 - Fixes on packaging and distribution format.
 - Introduction of this file (CHANGELOG.md) to track changes.
 - Introduction of .npmignore file to strictly define files from distribution.

## v1.0.2
First version of library published.
