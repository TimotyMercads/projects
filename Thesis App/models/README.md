# Drop your trained model files here

From the notebook's "PART 11 – Save Everything" step, you'll get these files:

| File | Required? | Purpose |
|---|---|---|
| `Best_Model.pkl` | Yes | The winning classifier (RF / XGBoost / MLP / KMeans hybrid) |
| `Scaler.pkl` | Yes | `StandardScaler` fit on the numeric columns |
| `TargetEncoder.pkl` | Yes | `LabelEncoder` for the `Performance` target |
| `Categorical_Encoders.pkl` | Yes | Dict of `LabelEncoder`s, one per categorical column |
| `KMeans.pkl` | Only if needed | Only required if the winning model was a "KMeans + Random Forest/XGBoost" hybrid |

Just copy them into this folder — no code changes needed, no restart required
if you call `POST /reload-model` after copying, otherwise restart `python app.py`.

The app runs fine without these files; it just shows a "demo mode" banner
and skips the AI Prediction section until they're present.
