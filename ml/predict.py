from pathlib import Path

import joblib
import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
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

NORMAL_SAMPLE = {
    "total_time": 762,
    "number_of_moves": 31,
    "number_of_clicks": 1,
    "average_speed": 0.265,
    "max_speed": 0.753,
    "pause_count": 1,
    "path_length": 202,
}

SHIFTED_SAMPLE = {
    "total_time": 145,
    "number_of_moves": 11,
    "number_of_clicks": 12,
    "average_speed": 10.503,
    "max_speed": 31.2,
    "pause_count": 0,
    "path_length": 1523,
}


def predict_trust(sample):
    model = joblib.load(MODEL_PATH)
    frame = pd.DataFrame([sample], columns=FEATURES)
    prediction = model.predict(frame)[0]
    anomaly_score = model.decision_function(frame)[0]

    return {
        "trusted": prediction == 1,
        "prediction": int(prediction),
        "anomaly_score": float(anomaly_score),
    }


def print_result(name, sample):
    result = predict_trust(sample)
    message = "Trusted behavior" if result["trusted"] else "Distribution shift detected"

    print(f"{name}: {message}")
    print(f"prediction={result['prediction']}")
    print(f"anomaly_score={result['anomaly_score']:.4f}")


def main():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Model not found at {MODEL_PATH}. Run `python3 ml/trainModel.py` first."
        )

    print_result("Normal sample", NORMAL_SAMPLE)
    print()
    print_result("Shifted sample", SHIFTED_SAMPLE)


if __name__ == "__main__":
    main()
