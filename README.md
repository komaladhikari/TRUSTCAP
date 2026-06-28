# TrustCAP
### Behavioral CAPTCHA Verification using Distribution Shift Detection

> **Research Prototype**
> Detecting abnormal user interaction behavior through unsupervised machine learning to improve trust in CAPTCHA systems.


# Overview

Traditional CAPTCHAs verify users by asking them to solve a challenge—selecting images, identifying traffic lights, or typing distorted text. However, these methods primarily evaluate **whether a task was completed**, not **how it was completed**.

TrustCAP explores a different question:

> **Can we determine whether a user is trustworthy by analyzing their interaction behavior instead of only verifying task completion?**

The project records mouse movement during a simple target-clicking task, extracts behavioral features, and applies an anomaly detection model to determine whether the behavior belongs to the distribution of trusted human interactions.

Instead of classifying users directly as **human** or **bot**, TrustCAP detects **distribution shift**—behavior that differs significantly from the data observed during training.

---

# Research Motivation

Modern AI systems often fail when the data they encounter differs from the data used during training.

This problem is known as **Distribution Shift** or **Out-of-Distribution (OOD) Detection**.

The same concept can be applied to CAPTCHA systems.

Rather than asking

> "Did the user solve the challenge?"

TrustCAP asks

> "Does this user's interaction resemble trusted human behavior?"

This shifts CAPTCHA verification from task completion toward **behavioral trust estimation.**

---

# Research Question

> **Can behavioral mouse dynamics be used to detect distribution shifts and estimate user trustworthiness during CAPTCHA verification?**

Sub-questions include:

- Can normal human interaction be represented using behavioral features?
- Can an anomaly detection model learn normal behavior without seeing bot examples?
- Can abnormal mouse dynamics indicate potential automation or previously unseen behavior?
- How can distribution shift detection improve the trustworthiness of human-computer interaction systems?

---

# Connection to Trustworthy AI Research

This project is inspired by a broader research problem:

> **How do we know when an AI model should stop trusting its own prediction because the incoming data differs from its training distribution?**

Many trustworthy AI systems attempt to answer:

```
Was this input similar to what the model learned?
```

TrustCAP applies the exact same idea to human interaction.

Instead of image data,

```
Image
↓

Feature Vector
↓

Distribution Check
↓

Prediction
```

TrustCAP uses

```
Mouse Behavior
↓

Behavior Features
↓

Distribution Check
↓

Trust Decision
```

Although the application domain changes, the underlying research problem remains identical:

**Trust under distribution shift.**

---

# System Architecture

```
                 User
                  │
                  ▼
      Mouse Interaction Interface
                  │
                  ▼
     Raw Mouse Movement Collection
                  │
                  ▼
      Behavioral Feature Extraction
                  │
                  ▼
         Feature Vector Generation
                  │
                  ▼
        Isolation Forest Model
                  │
         ┌────────┴────────┐
         │                 │
         ▼                 ▼
 Trusted Behavior     Distribution Shift
```

The architecture separates the system into four independent stages:

1. Data Collection
2. Feature Engineering
3. Machine Learning
4. Trust Decision

This modular design allows each stage to evolve independently.

---

# Frontend to Backend Data Collection

The frontend can send verified feature vectors to the backend so they can be
saved as future training data.

Current flow:

```
Mouse Trace
    ↓
Frontend Feature Extraction
    ↓
POST /api/samples
    ↓
Append row to ml/data/normal.csv
    ↓
Retrain Isolation Forest later
```

This is not the same as blindly trusting every prediction. The app only enables
the normal training-data save button after a trace reaches the target and
contains enough movement points. The backend then validates that each required
feature is present and numeric before writing a row.

Connection to trustworthy prediction:

- `normal.csv` represents the behavior distribution the model should trust.
- Saving frontend samples creates more examples of the expected deployment data.
- Retraining on these examples helps the model infer better data preconditions.
- If a future input does not match those learned preconditions, the prediction
  should be treated as less trustworthy.

Run the backend:

```bash
node backend/server.js
```

The backend listens on:

```text
http://127.0.0.1:4000
```

Endpoint:

```text
POST /api/samples
```

Example request body:

```json
{
  "label": "normal",
  "features": {
    "total_time": 1840,
    "number_of_moves": 64,
    "number_of_clicks": 1,
    "average_speed": 0.342,
    "max_speed": 1.12,
    "pause_count": 3,
    "path_length": 629
  }
}
```

After collecting new normal samples, retrain the model:

```bash
python3 ml/trainModel.py
```

---

# Architecture Components

## 1. Frontend

Responsible for collecting user interaction.

The React application presents a simple mouse tracking task where the user moves toward a target.

During interaction it records:

- Mouse coordinates
- Timestamps
- Click events
- Movement path

The frontend itself performs **no prediction**.

Its responsibility ends after behavioral data collection.

---

## 2. Feature Engineering

Raw mouse coordinates are transformed into meaningful behavioral statistics.

Current features include:

| Feature | Description |
|----------|-------------|
| Total Time | Total interaction duration |
| Number of Moves | Mouse movement events |
| Number of Clicks | Mouse clicks |
| Average Speed | Average cursor velocity |
| Maximum Speed | Peak cursor velocity |
| Pause Count | Number of pauses |
| Path Length | Total distance traveled |

Instead of storing every mouse coordinate, TrustCAP summarizes behavior into a compact feature vector.

This abstraction reduces dimensionality while preserving interaction characteristics.

---

## 3. Machine Learning Layer

The project uses

**Isolation Forest**

rather than a traditional supervised classifier.

Unlike binary classifiers,

Isolation Forest only learns **normal behavior**.

Training dataset:

```
Trusted Human Behavior
        ↓
Isolation Forest
        ↓
Normal Behavior Model
```

No bot data is required.

This mirrors many real-world anomaly detection systems where abnormal examples are scarce or constantly changing.

---

## 4. Decision Layer

During inference:

```
New Mouse Features
        ↓
Isolation Forest
        ↓
Anomaly Score
        ↓
Distribution Decision
```

If the sample resembles training behavior:

```
Trusted
```

Otherwise:

```
Distribution Shift Detected
```

Importantly,

TrustCAP does **not** claim that the user is a bot.

It only concludes that

> "This behavior differs from what the model learned."

---

# Machine Learning Pipeline

## Training

```
Normal Human Dataset
        │
        ▼
Feature Selection
        │
        ▼
Isolation Forest
        │
        ▼
Saved Model
```

Training only requires trusted behavioral samples.

---

## Prediction

```
User Interaction
        │
        ▼
Feature Extraction
        │
        ▼
Load Model
        │
        ▼
Decision Function
        │
        ▼
Trusted / Shifted
```

---

# Why Isolation Forest?

Isolation Forest is well suited because:

- No bot labels are required.
- Works well with relatively small datasets.
- Detects previously unseen behaviors.
- Produces anomaly scores rather than binary certainty.
- Aligns naturally with distribution shift detection.

Unlike supervised learning,

TrustCAP focuses on learning **normality** instead of memorizing known attacks.

---

# Repository Structure

```
TrustCAP/

├── frontend/
│   ├── App.jsx
│   ├── MouseCaptcha.jsx
│   ├── main.jsx
│   └── styles.css
│
├── ml/
│   ├── trainModel.py
│   ├── predict.py
│   ├── normal.csv
│   ├── shifted.csv
│   └── trustcap_model.pkl
│
├── requirements.txt
└── README.md
```

---

# Design Principles

The architecture follows several software engineering principles:

- Separation of Concerns
- Modular ML Pipeline
- Independent Feature Engineering Layer
- Frontend independent from ML implementation
- Replaceable prediction models
- Research-oriented experimentation

Because of this design, Isolation Forest can later be replaced with:

- One-Class SVM
- Local Outlier Factor
- Deep Autoencoders
- Variational Autoencoders
- DeepSVDD

without changing the frontend.

---

# Future Research Directions

Possible extensions include:

- Continuous authentication
- Keystroke dynamics
- Touchscreen behavioral biometrics
- Adaptive trust scoring
- Deep sequence models
- Online learning
- Explainable anomaly detection
- Multi-modal behavioral verification

---

# Technologies

Frontend

- React
- JavaScript
- HTML/CSS

Machine Learning

- Python
- Pandas
- Scikit-learn
- Joblib

Model

- Isolation Forest

---

# Key Takeaway

TrustCAP demonstrates how **behavioral biometrics** and **unsupervised anomaly detection** can be combined to estimate user trustworthiness without explicitly classifying users as human or bot.

The project reframes CAPTCHA verification as a **distribution shift detection problem**, making it closely aligned with current research in **Trustworthy AI**, **Out-of-Distribution Detection**, and **robust machine learning**.

Instead of asking:

> "Did the user complete the CAPTCHA?"

TrustCAP asks the more fundamental research question:

>"Does this behavior belong to the distribution of trusted human interactions?"
