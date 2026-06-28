from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import IsolationForest


BASE_DIR = Path(__file__).resolve().parent
NORMAL_DATA_PATH = BASE_DIR / "data" / "normal.csv"
SHIFTED_DATA_PATH = BASE_DIR / "data" / "shifted.csv"
MODEL_PATH = BASE_DIR / "trustcap_model.pkl"

FEATURES = [
    "total_time",
    "number_of_moves",
    "number_of_clicks",
    "average_speed",
    "max_speed",
    "pause_count",
    "path_length",
]


def load_features(csv_path):
    df = pd.read_csv(csv_path)
    missing_columns = [feature for feature in FEATURES if feature not in df.columns]

    if missing_columns:
        raise ValueError(f"{csv_path} is missing columns: {missing_columns}")

    return df, df[FEATURES]


def print_prediction_summary(name, predictions):
    normal_count = int((predictions == 1).sum())
    shifted_count = int((predictions == -1).sum())

    print(f"{name}: {normal_count} normal, {shifted_count} shifted")


def main():
    normal_df, X_normal = load_features(NORMAL_DATA_PATH)
    shifted_df, X_shifted = load_features(SHIFTED_DATA_PATH)

    model = IsolationForest(contamination=0.1, random_state=42)
    model.fit(X_normal)

    joblib.dump(model, MODEL_PATH)

    print(f"Trained on {len(normal_df)} normal samples")
    print(f"Saved model to {MODEL_PATH}")
    print_prediction_summary("Normal CSV", model.predict(X_normal))
    print_prediction_summary("Shifted CSV", model.predict(shifted_df[FEATURES]))


if __name__ == "__main__":
    main()
