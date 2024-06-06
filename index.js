const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 5000;

// Middlewares
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ihpbk8d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Middleware to log requests
const logger = (req, res, next) => {
  console.log('log: info', req.hostname, req.originalUrl);
  next();
};

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  console.log('token in the middleware', token);
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: 'unauthorized access' });
    }
    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();

    const biodataCollection = client.db("trueBond").collection("biodatas");
    const reviewCollection = client.db("trueBond").collection("reviews");
    const userCollection = client.db("trueBond").collection("users");
    const favoritesCollection = client.db("trueBond").collection("favorites");
    const paymentCollection = client.db("trueBond").collection("payments");

    // JWT generator
    app.post('/jwt', logger, async (req, res) => {
      const user = req.body;
      console.log(user);

      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1d'
      });

      // Log the generated token
      console.log('Generated Token:', token);


      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production' ? true : false,
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
    });

    // Logout route
    app.post('/logout', async (req, res) => {
      const user = req.body;
      console.log('logging out', user);
      res
        .clearCookie('token', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production' ? true : false,
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
    });

    // Users related API
    app.get('/premium-profiles', async (req, res) => {
      try {
        const sortOrder = req.query.sortOrder === 'descending' ? -1 : 1;
        const pipeline = [
          { $match: { role: 'premium' } },
          {
            $lookup: {
              from: 'biodatas',
              localField: 'email',
              foreignField: 'contactEmail',
              as: 'biodata'
            }
          },
          { $unwind: '$biodata' },
          { $sort: { 'biodata.age': sortOrder } },
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

    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get('/users/requested-premium', async (req, res) => {
      try {
        const pipeline = [
          { $match: { status: 'Requested for Premium' } },
          {
            $lookup: {
              from: 'biodatas',
              localField: 'email',
              foreignField: 'contactEmail',
              as: 'biodata'
            }
          },
          { $unwind: { path: '$biodata', preserveNullAndEmptyArrays: true } },
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

    app.get('/users/premium', async (req, res) => {
      const query = { role: 'premium' };
      try {
        const result = await userCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching premium users' });
      }
    });

    app.put('/user', async (req, res) => {
      const user = req.body;
      console.log('Received user data:', user);
      const query = { email: user?.email };

      if (!user || !user?.email) {
        return res.status(400).send({ message: "User email is required" });
      }

      try {
        const isExist = await userCollection.findOne(query);

        if (isExist) {
          if (user.status === 'Requested for Premium') {
            const result = await userCollection.updateOne(query, {
              $set: { status: user?.status }
            });
            return res.send(result);
          } else {
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
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    app.get('/user/:email', async (req, res) => {
      const email = req.params.email;
      const result = await userCollection.findOne({ email });
      res.send(result);
    });

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = { $set: { role: 'admin' } };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.patch('/users/premium/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = { $set: { role: 'premium' } };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.get('/users/search', async (req, res) => {
      const username = req.query.username;
      if (!username) {
        return res.status(400).send({ message: 'Username query parameter is required' });
      }
      const query = { name: { $regex: username, $options: 'i' } };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/reviews', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    app.get('/biodatas', async (req, res) => {
      const result = await biodataCollection.find().toArray();
      res.send(result);
    });

    app.get('/myBiodata/:contactEmail', async (req, res) => {
      const result = await biodataCollection.find({ contactEmail: req.params.contactEmail }).toArray();
      res.send(result);
    });

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
        res.status(500).send({ message: 'Error inserting/updating biodata' });
      }
    });

    app.get('/biodatas/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await biodataCollection.findOne(query);
      res.send(result);
    });

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
        res.status(500).send({ message: 'Error fetching biodata stats' });
      }
    });

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
        res.status(500).send({ message: 'Error fetching biodata stats' });
      }
    });

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
        res.status(500).send({ message: 'Error adding to favorites' });
      }
    });

    app.get('/favorites', async (req, res) => {
      try {
        const favorites = await favoritesCollection.find().toArray();
        const favoriteBiodatas = await biodataCollection.find({
          _id: { $in: favorites.map(f => new ObjectId(f.biodataId)) }
        }).toArray();
        res.send(favoriteBiodatas);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching favorites' });
      }
    });

    app.delete('/favorites/:id', async (req, res) => {
      const id = req.params.id;
      try {
        const result = await favoritesCollection.deleteOne({ biodataId: id });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error deleting favorite' });
      }
    });

    // payment related api
    app.get('/payments/:email', async (req, res) => {
      const query = { email: req.params.email }
      // if (req.params.email !== req.decoded.email) {
      //   return res.status(403).send({ message: 'forbidden access' });
      // }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    })

    // payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount, 'amount inside the intent');

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      // carefully delete each item from the ...(if needed)

      console.log('payment info', payment);
      res.send(paymentResult);


    })

    app.delete('/payments/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await paymentCollection.deleteOne(query);
      res.send(result);
    })


    // extra testing
    app.get('/payments', async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result)
    })


    ///
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
