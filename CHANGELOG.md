# Changelog

All notable changes to this project are documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/).

[//]: # (## [Unreleased])

[//]: # ()
[//]: # (### Added)

[//]: # (- _No entries yet._)

## [1.1.1]

### Changed
- Improved the transaction form by placing credit-card-specific fields in a more intuitive location.

## [1.1.0]

### Added
- Excel export for boards using `.xlsx` output.
- Super-board export support with multiple worksheets (one worksheet per sub-board).
- Optional summary worksheet in super-board exports.
- Safer Excel export sanitization for sheet names, file names, and formula-like text values.
- Explicit direct vs. inherited collaborator display in board collaboration management.

### Changed
- Documentation refresh across README, security policy, and release notes for the `v1.1.0` release.
- Version alignment across frontend and Cloud Functions packages to `1.1.0`.

### Fixed
- Export date handling and workbook formatting improvements in generated Excel files.
- Export-related CSP allowance updates for ExcelJS-hosted assets.
- Board/super-board export UI flow improvements and related stability fixes.

### Security
- Security policy updated to supported-version policy for `1.1.x` and private reporting guidance.

## [1.0.4]

### Changed
- Dependency and maintenance updates before `1.1.0`.

## [1.0.1]

### Changed
- Early post-`1.0.0` maintenance updates.

## [1.0.0]

### Added
- Initial public release of the Expense Management application.
