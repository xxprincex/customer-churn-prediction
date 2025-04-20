import {
  collection,
  query,
  orderBy,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";

// Batch prediction functions
export const getBatchPredictions = async (userId) => {
  try {
    const batchRef = collection(db, "Users", userId, "batchPredictions");
    const q = query(batchRef, orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate() || new Date(),
    }));
  } catch (error) {
    console.error("Error fetching batch predictions:", error);
    throw error;
  }
};

export const getBatchPredictionById = async (userId, batchId) => {
  try {
    // Get main document
    const docRef = doc(db, "Users", userId, "batchPredictions", batchId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error("Batch prediction not found");
    }

    const mainDoc = {
      id: docSnap.id,
      ...docSnap.data(),
      timestamp: docSnap.data().timestamp?.toDate() || new Date(),
    };

    // Get all chunks if they exist
    if (mainDoc.totalChunks > 0) {
      const chunksRef = collection(docRef, "chunks");
      const chunksSnapshot = await getDocs(chunksRef);

      // Combine all predictions from chunks
      const allPredictions = chunksSnapshot.docs
        .sort((a, b) => a.data().chunkIndex - b.data().chunkIndex)
        .flatMap((doc) => doc.data().predictions);

      return {
        ...mainDoc,
        predictions: allPredictions,
      };
    }

    return mainDoc;
  } catch (error) {
    console.error("Error fetching batch prediction:", error);
    throw error;
  }
};

export const deleteBatchPrediction = async (userId, batchId) => {
  try {
    const batch = writeBatch(db);
    const batchRef = doc(db, "Users", userId, "batchPredictions", batchId);

    // Delete all chunks first
    const chunksRef = collection(batchRef, "chunks");
    const chunksSnapshot = await getDocs(chunksRef);
    chunksSnapshot.docs.forEach((chunkDoc) => {
      batch.delete(doc(chunksRef, chunkDoc.id));
    });

    // Delete main document
    batch.delete(batchRef);

    // Commit the batch
    await batch.commit();
  } catch (error) {
    console.error("Error deleting batch prediction:", error);
    throw error;
  }
};
