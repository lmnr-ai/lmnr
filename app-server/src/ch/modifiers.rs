use serde::Deserialize;

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum GroupByInterval {
    Minute,
    Hour,
    Day,
}

impl Default for GroupByInterval {
    fn default() -> Self {
        GroupByInterval::Hour
    }
}

impl GroupByInterval {
    pub fn to_ch_truncate_time(&self) -> &str {
        match self {
            GroupByInterval::Minute => "toStartOfMinute",
            GroupByInterval::Hour => "toStartOfHour",
            GroupByInterval::Day => "toStartOfDay",
        }
    }

    pub fn to_interval(&self) -> &str {
        match self {
            GroupByInterval::Minute => "1 MINUTE",
            GroupByInterval::Hour => "1 HOUR",
            GroupByInterval::Day => "1 DAY",
        }
    }

    pub fn to_ch_step(&self) -> &str {
        match self {
            GroupByInterval::Minute => "toIntervalMinute(1)",
            GroupByInterval::Hour => "toIntervalHour(1)",
            GroupByInterval::Day => "toIntervalDay(1)",
        }
    }
}
