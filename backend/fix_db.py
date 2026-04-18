from backend.database import engine, Base
import backend.models.db_models
Base.metadata.create_all(bind=engine)
print("Done")
