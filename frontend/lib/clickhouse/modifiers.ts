export enum GroupByInterval {
    Minute = 'minute',
    Hour = 'hour',
    Day = 'day'
}

export const truncateTimeMap: Record<GroupByInterval, string> = {
  [GroupByInterval.Minute]: 'toStartOfMinute',
  [GroupByInterval.Hour]: 'toStartOfHour',
  [GroupByInterval.Day]: 'toStartOfDay',
};

export const intervalMap: Record<GroupByInterval, string> = {
  [GroupByInterval.Minute]: '1 MINUTE',
  [GroupByInterval.Hour]: '1 HOUR',
  [GroupByInterval.Day]: '1 DAY',
};

export const chStepMap: Record<GroupByInterval, string> = {
  [GroupByInterval.Minute]: 'toIntervalMinute(1)',
  [GroupByInterval.Hour]: 'toIntervalHour(1)',
  [GroupByInterval.Day]: 'toIntervalDay(1)',
};
