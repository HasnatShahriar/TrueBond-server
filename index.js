
const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ihpbk8d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();

    const biodataCollection = client.db("trueBond").collection("biodatas");
    const reviewCollection = client.db("trueBond").collection("reviews");
    const userCollection = client.db("trueBond").collection("users");
    const favoritesCollection = client.db("trueBond").collection("favorites");

    // Users related API

    // Aggregation endpoint
    app.get('/premium-profiles', async (req, res) => {
      try {
        const sortOrder = req.query.sortOrder === 'descending' ? -1 : 1;

        const pipeline = [
          {
            $match: { role: 'premium' }
          },
          {
            $lookup: {
              from: 'biodatas',
              localField: 'email',
              foreignField: 'contactEmail',
              as: 'biodata'
            }
          },
          {
            $unwind: '$biodata'
          },
          {
            $sort: { 'biodata.age': sortOrder }
          },
          {
            $project: {
              _id: '$biodata._id',
              email: 1,
              name: '$biodata.name',
              biodataType: '$biodata.biodataType',
              profileImageUrl: '$biodata.profileImageUrl',
              age: '$biodata.age',
              occupation: '$biodata.occupation',
              permanentDivision: '$biodata.permanentDivision',
              biodataId: '$biodata.biodataId'
            }
          }
        ];

        const result = await userCollection.aggregate(pipeline).toArray();
        res.send(result);
      } catch (error) {
        console.error('Error fetching premium profiles:', error);
        res.status(500).send({ message: 'Error fetching premium profiles' });
      }
    });


    // all users
    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });




    // only premium 
    // app.get('/users/requested-premium', async (req, res) => {
    //   const query = { status: 'Requested for Premium' };
    //   const result = await userCollection.find(query).toArray();
    //   res.send(result);
    // });

    app.get('/users/requested-premium', async (req, res) => {
      try {
        const pipeline = [
          {
            $match: { status: 'Requested for Premium' }
          },
          {
            $lookup: {
              from: 'biodatas',
              localField: 'email',
              foreignField: 'contactEmail',
              as: 'biodata'
            }
          },
          {
            $unwind: {
              path: '$biodata',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $project: {
              _id: '$biodata._id',
              email: '$biodata.contactEmail',
              name: '$biodata.name',
              biodataType: '$biodata.biodataType',
              biodataId: '$biodata.biodataId'
            }
          }
        ];

        const result = await userCollection.aggregate(pipeline).toArray();
        res.send(result);
      } catch (error) {
        console.error('Error fetching requested premium users:', error);
        res.status(500).send({ message: 'Error fetching requested premium users' });
      }
    });









    // Get all premium users
    app.get('/users/premium', async (req, res) => {
      const query = { role: 'premium' };
      try {
        const result = await userCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching premium users' });
      }
    });

    // Save a user data in db
    app.put('/user', async (req, res) => {
      const user = req.body;
      console.log('Received user data:', user);
      const query = { email: user?.email };

      if (!user || !user?.email) {
        return res.status(400).send({ message: "User email is required" });
      }

      try {
        const isExist = await userCollection.findOne(query);
        // console.log('User exists:', isExist);

        if (isExist) {
          if (user.status === 'Requested for Premium') {
            const result = await userCollection.updateOne(query, {
              $set: { status: user?.status }
            });
            // console.log('User status updated:', result);
            return res.send(result);
          } else {
            console.log('User already exists but no status change requested');
            return res.send(isExist);
          }
        }

        const options = { upsert: true };
        const updateDoc = {
          $set: {
            ...user,
            timestamp: Date.now()
          }
        };
        const result = await userCollection.updateOne(query, updateDoc, options);
        console.log('User data saved:', result);
        res.send(result);
      } catch (error) {
        // console.error('Error saving user:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });


    // Get a user info by email
    app.get('/user/:email', async (req, res) => {
      const email = req.params.email;
      const result = await userCollection.findOne({ email });
      res.send(result);
    });

    // Set user role to admin
    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // Set user role to premium
    app.patch('/users/premium/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'premium'
        }
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // Search users by username
    app.get('/users/search', async (req, res) => {
      const username = req.query.username;
      if (!username) {
        return res.status(400).send({ message: 'Username query parameter is required' });
      }
      const query = { name: { $regex: username, $options: 'i' } };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    // Review related API
    app.get('/reviews', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    // Biodata related API
    app.get('/biodatas', async (req, res) => {
      const result = await biodataCollection.find().toArray();
      res.send(result);
    });

    // Get biodata by email
    app.get('/myBiodata/:contactEmail', async (req, res) => {
      const result = await biodataCollection.find({ contactEmail: req.params.contactEmail }).toArray();
      res.send(result);
    });

    // Handle creation and update of biodata
    app.put('/biodatas', async (req, res) => {
      const biodata = req.body;
      try {
        const existingBiodata = await biodataCollection.findOne({ contactEmail: biodata.contactEmail });
        let newBiodataId;
        if (!existingBiodata) {
          const lastBiodata = await biodataCollection.find().sort({ _id: -1 }).limit(1).toArray();
          newBiodataId = lastBiodata.length === 0 ? 1 : lastBiodata[0].biodataId + 1;
        }

        biodata.biodataId = newBiodataId;

        if (existingBiodata) {
          const filter = { contactEmail: biodata.contactEmail };
          const updateDoc = {
            $set: { ...biodata }
          };
          const result = await biodataCollection.updateOne(filter, updateDoc);
          res.send(result);
        } else {
          const result = await biodataCollection.insertOne(biodata);
          res.send(result);
        }
      } catch (error) {
        // console.error('Error inserting/updating biodata:', error);
        res.status(500).send({ message: 'Error inserting/updating biodata' });
      }
    });

    app.get('/biodatas/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await biodataCollection.findOne(query);
      res.send(result);
    });

    // stats or analytics
    app.get('/admin-stats', async (req, res) => {
      try {
        const totalBiodata = await biodataCollection.estimatedDocumentCount();
        const [maleBiodataCount, femaleBiodataCount] = await Promise.all([
          biodataCollection.countDocuments({ biodataType: "Male" }),
          biodataCollection.countDocuments({ biodataType: "Female" }),
        ]);
        const premiumBiodataCount = await userCollection.countDocuments({ role: "premium" });
        res.send({
          totalBiodata,
          maleBiodataCount,
          femaleBiodataCount,
          premiumBiodataCount,
        });
      } catch (error) {
        // console.error('Error fetching biodata stats:', error);
        res.status(500).send({ message: 'Error fetching biodata stats' });
      }
    });

    // for counter section
    app.get('/counter-section', async (req, res) => {
      try {
        const totalBiodata = await biodataCollection.estimatedDocumentCount();
        const [maleBiodataCount, femaleBiodataCount] = await Promise.all([
          biodataCollection.countDocuments({ biodataType: "Male" }),
          biodataCollection.countDocuments({ biodataType: "Female" }),
        ]);

        // TODO: Got Married count

        res.send({
          totalBiodata,
          maleBiodataCount,
          femaleBiodataCount,
        });
      } catch (error) {
        // console.error('Error fetching biodata stats:', error);
        res.status(500).send({ message: 'Error fetching biodata stats' });
      }
    });

    // favorite related api
    // Endpoint to add a biodata to favorites
    app.post('/favorites', async (req, res) => {
      const { biodataId } = req.body;
      if (!biodataId) {
        return res.status(400).send({ message: 'Biodata ID is required' });
      }

      try {
        const existingFavorite = await favoritesCollection.findOne({ biodataId });
        if (existingFavorite) {
          return res.status(400).send({ message: 'Biodata is already in favorites' });
        }

        const result = await favoritesCollection.insertOne({ biodataId });
        res.send(result);
      } catch (error) {
        // console.error('Error adding to favorites:', error);
        res.status(500).send({ message: 'Error adding to favorites' });
      }
    });

    // Endpoint to get all favorite biodatas
    app.get('/favorites', async (req, res) => {
      try {
        const favorites = await favoritesCollection.find().toArray();
        const favoriteBiodatas = await biodataCollection.find({
          _id: { $in: favorites.map(f => new ObjectId(f.biodataId)) }
        }).toArray();
        res.send(favoriteBiodatas);
      } catch (error) {
        // console.error('Error fetching favorites:', error);
        res.status(500).send({ message: 'Error fetching favorites' });
      }
    });

    // Endpoint to delete a favorite biodata
    app.delete('/favorites/:id', async (req, res) => {
      const id = req.params.id;
      try {
        const result = await favoritesCollection.deleteOne({ biodataId: id });
        res.send(result);
      } catch (error) {
        // console.error('Error deleting favorite:', error);
        res.status(500).send({ message: 'Error deleting favorite' });
      }
    });

    // send a ping confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Alhamdulillah, TrueBond Server is Running');
});

app.listen(port, () => {
  console.log(`TrueBond server is running on port ${port}`);
});
