use std::collections::HashMap;

use crate::db::evaluations::EvaluationDatapointScores;

pub fn calculate_average_scores(
    datapoint_scores: Vec<EvaluationDatapointScores>,
) -> HashMap<String, f64> {
    let mut values_per_score = HashMap::<String, Vec<f64>>::new();
    for score in datapoint_scores {
        let score: HashMap<String, f64> = serde_json::from_value(score.scores).unwrap_or_default();
        for (name, value) in score {
            values_per_score
                .entry(name)
                .and_modify(|values| {
                    values.push(value);
                })
                .or_insert(vec![value]);
        }
    }

    // Map from score name to average value
    let averages = values_per_score
        .into_iter()
        .map(|(name, values)| {
            let length = values.len();
            let mean = if length == 0 {
                0.0
            } else {
                values.iter().sum::<f64>() / length as f64
            };
            (name, mean)
        })
        .collect::<HashMap<_, _>>();

    averages
}
