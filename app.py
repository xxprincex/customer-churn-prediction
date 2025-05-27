import pickle
import numpy as np
from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
import pandas as pd
from sklearn.preprocessing import LabelEncoder, MinMaxScaler, StandardScaler
import joblib
import time
import stripe
import firebase_admin
from firebase_admin import credentials, firestore
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
import json

load_dotenv()

# Load Stripe configuration
STRIPE_API_KEY = os.getenv("STRIPE_SECRET_KEY")  # Use STRIPE_SECRET_KEY from .env
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

# Initialize Flask app with correct static folder configuration
app = Flask(__name__, static_folder='dist')

# Configure CORS properly
CORS(app, resources={
    r"/api/*": {"origins": "*"},
    r"/*": {"origins": "*"}
})

# Add security headers
@app.after_request
def add_security_headers(response):
    response.headers['Permissions-Policy'] = 'interest-cohort=()'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    return response

# Initialize Firebase Admin
try:
    firebase_config = os.getenv('FIREBASE_CONFIG')
    if firebase_config:
        try:
            cred_dict = json.loads(firebase_config)
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
        except json.JSONDecodeError as e:
            print(f"Error parsing Firebase config: {e}")
            print("Please check your FIREBASE_CONFIG environment variable format")
            # Initialize with default credentials if available
            try:
                firebase_admin.initialize_app()
            except ValueError as e:
                print(f"Error initializing Firebase: {e}")
    else:
        print("Warning: FIREBASE_CONFIG environment variable not set")
        # Initialize with default credentials if available
        try:
            firebase_admin.initialize_app()
        except ValueError as e:
            print(f"Error initializing Firebase: {e}")
except Exception as e:
    print(f"Error during Firebase initialization: {e}")

# Initialize Firestore
try:
    db = firestore.client()
except Exception as e:
    print(f"Error initializing Firestore: {e}")
    db = None

# Initialize Stripe
stripe.api_key = STRIPE_API_KEY
endpoint_secret = STRIPE_WEBHOOK_SECRET

# Load the trained model
with open('model_classifier.pkl', 'rb') as f:
    model = pickle.load(f)

# Create a scaler for feature normalization
scaler = MinMaxScaler()
# Fit the scaler with a reasonable range for each feature to ensure consistent scaling
sample_data = np.array([
    [0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],  # Min values
    [30, 2, 3, 40, 6, 1, 10, 10, 4, 5, 2, 15, 1, 30, 20, 30, 30, 300]   # Max values
])
scaler.fit(sample_data)  # Pre-fit the scaler with expected min/max ranges

# Define categorical columns that need encoding
categorical_columns = [
    'PreferredLoginDevice', 
    'PreferredPaymentMode', 
    'Gender',
    'PreferedOrderCat', 
    'MaritalStatus'
]

# Define all feature columns in the correct order
feature_columns = [
    'Tenure', 'PreferredLoginDevice', 'CityTier', 'WarehouseToHome',
    'PreferredPaymentMode', 'Gender', 'HourSpendOnApp', 'NumberOfDeviceRegistered',
    'PreferedOrderCat', 'SatisfactionScore', 'MaritalStatus', 'NumberOfAddress',
    'Complain', 'OrderAmountHikeFromlastYear', 'CouponUsed', 'OrderCount',
    'DaySinceLastOrder', 'CashbackAmount'
]

# Create label encoders for categorical features
label_encoders = {}
for column in categorical_columns:
    label_encoders[column] = LabelEncoder()

# Define mappings for categorical variables based on the training data
label_encoders['PreferredLoginDevice'].fit(['Mobile Phone', 'Tablet Phone', 'Computer'])
label_encoders['PreferredPaymentMode'].fit([ 'Debit Card', 'UPI', 'E wallet', 'Cash on Delivery', 'Credit Card'])
label_encoders['Gender'].fit(['Male', 'Female'])
label_encoders['PreferedOrderCat'].fit(['Laptop & Accessory', 'Mobile Phone', 'Fashion', 'Grocery', 'Others', 'Mobile'])
label_encoders['MaritalStatus'].fit(['Single', 'Married', 'Divorced'])

def adjust_probability(churn_prob, data):
    """Adjust churn probability based on comprehensive risk analysis"""
    
    # Initialize risk tracking
    risk_score = 0
    risk_factors = []
    positive_factors = []
    
    # 1. Critical Risk Factors (Heavy weight: ±0.15 each)
    if int(data.get('Complain', 0)) > 0:
        risk_score += 3
        risk_factors.append("Has filed complaints")
    
    if float(data.get('SatisfactionScore', 5)) <= 2:
        risk_score += 3
        risk_factors.append("Very low satisfaction score")
    elif float(data.get('SatisfactionScore', 5)) >= 4:
        risk_score -= 3
        positive_factors.append("High satisfaction score")
    
    # 2. Engagement Factors (Medium weight: ±0.1 each)
    # Tenure analysis
    tenure = int(data.get('Tenure', 0))
    if tenure < 3:
        risk_score += 2
        risk_factors.append("Very short tenure")
    elif tenure > 12:
        risk_score -= 2
        positive_factors.append("Long-term customer")
    
    # Order patterns
    order_count = int(data.get('OrderCount', 0))
    if order_count <= 2:
        risk_score += 2
        risk_factors.append("Low order count")
    elif order_count >= 5:
        risk_score -= 2
        positive_factors.append("Regular ordering pattern")
    
    # Recent activity
    days_since_order = int(data.get('DaySinceLastOrder', 0))
    if days_since_order > 30:
        risk_score += 2
        risk_factors.append("Long time since last order")
    elif days_since_order <= 7:
        risk_score -= 2
        positive_factors.append("Recently active")
    
    # 3. Platform Engagement (Light weight: ±0.05 each)
    devices = int(data.get('NumberOfDeviceRegistered', 0))
    if devices >= 3:
        risk_score -= 1
        positive_factors.append("Multi-device engagement")
    
    hours_on_app = float(data.get('HourSpendOnApp', 0))
    if hours_on_app >= 3:
        risk_score -= 1
        positive_factors.append("High app engagement")
    elif hours_on_app < 1:
        risk_score += 1
        risk_factors.append("Low app engagement")
    
    # 4. Value and Growth Indicators
    order_hike = float(data.get('OrderAmountHikeFromlastYear', 0))
    if order_hike > 15:
        risk_score -= 1
        positive_factors.append("Strong order value growth")
    elif order_hike < 5:
        risk_score += 1
        risk_factors.append("Declining order value")
    
    coupon_usage = int(data.get('CouponUsed', 0))
    if coupon_usage >= 5:
        risk_score -= 1
        positive_factors.append("Active promotion participant")
    
    # 5. Demographic/Geographic Factors
    city_tier = int(data.get('CityTier', 1))
    if city_tier == 3 and tenure < 6:
        risk_score += 1
        risk_factors.append("New customer in Tier 3 city")
    
    # Calculate final adjustment
    # Each point is worth 5% adjustment
    adjustment = 1.0 + (risk_score * 0.05)
    
    # Ensure probability stays within valid range
    adjusted_prob = max(0.0, min(1.0, churn_prob * adjustment))
    
    # Sort factors by importance (critical first)
    risk_factors.sort(key=lambda x: len(x), reverse=True)
    positive_factors.sort(key=lambda x: len(x), reverse=True)
    
    # Combine all factors, with risk factors first
    all_factors = risk_factors + positive_factors
    
    return adjusted_prob, all_factors

def clean_numeric_value(value, default=0):
    """Clean and validate numeric values"""
    if value is None or value == '':
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default

@app.route('/api/predict', methods=['POST'])
def predict():
    try:
        # Get data from request
        data = request.json
        
        # Convert to DataFrame with a single row
        input_df = pd.DataFrame([data])
        
        # Convert string values to appropriate types and validate ranges
        for col in input_df.columns:
            if col in ['CityTier', 'Complain']:
                input_df[col] = input_df[col].astype(int)
                # Validate CityTier (should be 1, 2, or 3)
                if col == 'CityTier' and input_df[col].values[0] not in [1, 2, 3]:
                    return jsonify({"error": f"Invalid value for CityTier: must be 1, 2, or 3"}), 400
                # Validate Complain (should be 0 or 1)
                if col == 'Complain' and input_df[col].values[0] not in [0, 1]:
                    return jsonify({"error": f"Invalid value for Complain Status: must be No Complain  or Has Complain"}), 400
            elif col not in categorical_columns:
                input_df[col] = input_df[col].astype(float)
                # Validate numerical ranges to prevent extreme values
                if col == 'Tenure' and (input_df[col].values[0] < 0 or input_df[col].values[0] > 61):
                    return jsonify({"error": f"Invalid value for Tenure: must be between 0 months and 61 months"}), 400
                if col == 'SatisfactionScore' and (input_df[col].values[0] < 1 or input_df[col].values[0] > 5):
                    return jsonify({"error": f"Invalid value for SatisfactionScore: must be between 1 and 5"}), 400
        
        # Encode categorical variables
        for column in categorical_columns:
            if column in input_df.columns:
                try:
                    input_df[column] = label_encoders[column].transform(input_df[column])
                except ValueError as e:
                    return jsonify({"error": f"Invalid value for {column}: {str(e)}"}), 400
        
        # Ensure all required features are present and in correct order
        features = np.zeros(len(feature_columns))
        for i, feature in enumerate(feature_columns):
            if feature in input_df.columns:
                features[i] = input_df[feature].values[0]
        
        # Scale features using MinMaxScaler to match training data
        features_reshaped = features.reshape(1, -1)
        features_scaled = scaler.transform(features_reshaped)  # Use transform instead of fit_transform
        
        # Make prediction
        prediction = int(model.predict(features_scaled)[0])
        
        # Get probability scores
        proba = model.predict_proba(features_scaled)[0]
        stay_probability = float(proba[0])  # Probability of class 0 (stay)
        churn_probability = float(proba[1])  # Probability of class 1 (churn)
        
        # Apply post-prediction adjustments
        adjusted_probability, risk_factors = adjust_probability(churn_probability, data)
        
        # Final prediction based on adjusted probability
        final_prediction = 1 if adjusted_probability >= 0.5 else 0
        
        return jsonify({
            "prediction": final_prediction,
            "stay_probability": float(1 - adjusted_probability),
            "churn_probability": float(adjusted_probability),
            "prediction_label": "Likely to Churn" if final_prediction == 1 else "Likely to Stay",
            "risk_factors": risk_factors
        })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/webhook', methods=['POST'])
def webhook():
    print(f"Webhook received. STRIPE_WEBHOOK_SECRET exists: {bool(STRIPE_WEBHOOK_SECRET)}")
    print(f"Endpoint secret exists: {bool(endpoint_secret)}")
    print(f"Request headers: {request.headers}")
    
    if not endpoint_secret:
        print("Warning: Stripe webhook secret is not set!")
        return jsonify({'error': 'Stripe webhook secret is not configured'}), 500

    payload = request.data
    sig_header = request.headers.get('Stripe-Signature')
    print(f"Stripe-Signature header received: {bool(sig_header)}")

    if not sig_header:
        print("No Stripe signature header")
        return jsonify({'error': 'No Stripe signature header'}), 400

    try:
        print(f"Attempting to construct event with signature: {sig_header[:15]}...")
        event = stripe.Webhook.construct_event(
            payload, sig_header, endpoint_secret
        )
        print(f"Event constructed successfully: {event['type']}")
    except ValueError as e:
        print("Invalid payload:", e)
        return jsonify({'error': 'Invalid payload'}), 400
    except stripe.error.SignatureVerificationError as e:
        print("Invalid signature:", e)
        return jsonify({'error': 'Invalid signature'}), 400

    # Handle the checkout.session.completed event
    if event['type'] == 'checkout.session.completed':
        try:
            session = event['data']['object']
            print(f"Processing checkout.session.completed event. Session ID: {session.get('id')}")
            print(f"Session metadata: {session.get('metadata')}")
            
            # Check if this is a payment link session
            payment_link = session.get('payment_link')
            print(f"Payment link: {payment_link}")
            
            # Get firebase_uid from Stripe session metadata
            firebase_uid = session.get('metadata', {}).get('firebase_uid')
            print(f"Received firebase_uid from Stripe: {firebase_uid}")
            
            # If firebase_uid is not in metadata, try to get it from client_reference_id
            if not firebase_uid:
                client_reference_id = session.get('client_reference_id')
                print(f"No firebase_uid in metadata. Client reference ID: {client_reference_id}")
                firebase_uid = client_reference_id
            
            if not firebase_uid:
                # Try to find user by email
                customer_email = session.get('customer_details', {}).get('email')
                print(f"No firebase_uid found. Trying to find user by email: {customer_email}")
                
                if customer_email:
                    # Query Firestore for user with matching email
                    users_ref = db.collection('Users')
                    query = users_ref.where('email', '==', customer_email).limit(1)
                    user_docs = query.get()
                    
                    if len(user_docs) > 0:
                        firebase_uid = user_docs[0].id
                        print(f"Found user by email: {firebase_uid}")
                    else:
                        print(f"No user found with email: {customer_email}")
                else:
                    print("No customer email available in session")
            
            if not firebase_uid:
                print("No firebase_uid found in Stripe session metadata or client_reference_id.")
                return jsonify({'error': 'Missing firebase_uid in Stripe session'}), 400

            # Directly reference the user document using UID
            user_ref = db.collection('Users').document(firebase_uid)
            user_doc = user_ref.get()

            if not user_doc.exists:
                print(f"No user found with UID: {firebase_uid}")
                return jsonify({'error': 'User not found'}), 404
            
            print(f"Found user document: {user_doc.id}")
            user_data = user_doc.to_dict()
            print(f"Current subscription plan: {user_data.get('subscriptionPlan')}")

            # Update user data
            now = datetime.now()
            subscription_end = now + timedelta(days=30)

            update_data = {
                'subscriptionPlan': 'gold',
                'trialUsed': True,
                'trialEndDate': None,
                'trialStartDate': None,
                'subscriptionStartDate': now,
                'subscriptionEndDate': subscription_end,
                'lastUpdated': now,
                'stripeSessionId': session.get('id'),
            }

            print(f"Updating user with data: {update_data}")
            user_ref.update(update_data)
            print(f"Successfully updated user {firebase_uid} to gold plan.")

            return jsonify({'status': 'success', 'message': 'Subscription updated'}), 200

        except Exception as e:
            print(f"Error processing checkout session: {str(e)}")
            return jsonify({'error': f'Error processing checkout: {str(e)}'}), 500

    # Handle invoice.payment_succeeded event
    elif event['type'] == 'invoice.payment_succeeded':
        try:
            invoice = event['data']['object']
            print(f"Processing invoice.payment_succeeded event. Invoice ID: {invoice.get('id')}")
            print(f"Full invoice data: {invoice}")
            
            # Get customer ID from the invoice
            customer_id = invoice.get('customer')
            if not customer_id:
                print("No customer ID found in invoice")
                return jsonify({'error': 'Missing customer ID in invoice'}), 400
                
            # Get subscription ID from the invoice
            subscription_id = None
            if invoice.get('subscription'):
                subscription_id = invoice.get('subscription')
            elif invoice.get('lines', {}).get('data'):
                for item in invoice.get('lines', {}).get('data', []):
                    if item.get('subscription'):
                        subscription_id = item.get('subscription')
                        break
                    if item.get('parent', {}).get('subscription'):
                        subscription_id = item.get('parent', {}).get('subscription')
                        break
            
            print(f"Found subscription ID: {subscription_id}")
            
            # Get customer email from the invoice
            customer_email = invoice.get('customer_email')
            print(f"Customer email from invoice: {customer_email}")
            
            # If email not found directly, try to get it from customer_details
            if not customer_email and invoice.get('customer_details', {}):
                customer_email = invoice.get('customer_details', {}).get('email')
                print(f"Customer email from customer_details: {customer_email}")
            
            # If still no email, try to extract from description
            if not customer_email and invoice.get('description'):
                description = invoice.get('description')
                print(f"Invoice description: {description}")
                # Try to extract email from description if it contains an email pattern
                import re
                email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
                email_matches = re.findall(email_pattern, description)
                if email_matches:
                    customer_email = email_matches[0]
                    print(f"Extracted email from description: {customer_email}")
            
            # Special handling for the specific invoice.payment_succeeded format we saw
            # Look for email in the format: "krishnarajkrishna125@gmail.com's payment for an invoice for INR 999.00 succeeded"
            if not customer_email:
                # Try to get from the event description field
                if invoice.get('description'):
                    description = invoice.get('description')
                    apostrophe_index = description.find("'s")
                    if apostrophe_index > 0:
                        potential_email = description[:apostrophe_index].strip()
                        if '@' in potential_email and '.' in potential_email:
                            customer_email = potential_email
                            print(f"Extracted email from apostrophe format: {customer_email}")
                
                # If not found in description, check if it's in the event data directly
                if not customer_email and event.get('data', {}).get('object', {}).get('description'):
                    description = event.get('data', {}).get('object', {}).get('description')
                    apostrophe_index = description.find("'s")
                    if apostrophe_index > 0:
                        potential_email = description[:apostrophe_index].strip()
                        if '@' in potential_email and '.' in potential_email:
                            customer_email = potential_email
                            print(f"Extracted email from event data description: {customer_email}")
                            
                # Also check if it's in the event type description
                if not customer_email and event.get('type') == 'invoice.payment_succeeded':
                    # Try to parse from the raw payload
                    try:
                        payload_str = request.data.decode('utf-8')
                        if 'payment for an invoice' in payload_str and '@' in payload_str:
                            import re
                            email_pattern = r'([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}).*?payment for an invoice'
                            matches = re.findall(email_pattern, payload_str)
                            if matches:
                                customer_email = matches[0]
                                print(f"Extracted email from raw payload: {customer_email}")
                    except Exception as e:
                        print(f"Error parsing raw payload: {str(e)}")
                        pass
                        
            # Try to get customer details from Stripe API if we have customer ID
            if not customer_email and customer_id:
                try:
                    customer = stripe.Customer.retrieve(customer_id)
                    if customer and customer.get('email'):
                        customer_email = customer.get('email')
                        print(f"Retrieved customer email from Stripe API: {customer_email}")
                except Exception as e:
                    print(f"Error retrieving customer from Stripe: {str(e)}")
                    pass
                    
            # Direct handling for the specific format in the webhook we received
            # Format: "krishnarajkrishna125@gmail.com's payment for an invoice for INR 999.00 succeeded"
            if not customer_email and event.get('type') == 'invoice.payment_succeeded':
                try:
                    # Try to extract from the raw event data
                    event_data_str = str(event)
                    if "'s payment for an invoice" in event_data_str:
                        import re
                        # Look for pattern like: email's payment for an invoice
                        pattern = r"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})'s payment for an invoice"
                        matches = re.findall(pattern, event_data_str)
                        if matches:
                            customer_email = matches[0]
                            print(f"Extracted email from event data string: {customer_email}")
                except Exception as e:
                    print(f"Error extracting email from event data string: {str(e)}")
                    pass
            
            # Find the Firebase user by customer email
            firebase_uid = None
            if customer_email:
                # Query Firestore for user with matching email
                users_ref = db.collection('Users')
                query = users_ref.where('email', '==', customer_email).limit(1)
                user_docs = query.get()
                
                if len(user_docs) > 0:
                    firebase_uid = user_docs[0].id
                    print(f"Found user by email: {firebase_uid}")
            
            # If no user found by email, try to find by client_reference_id in metadata
            if not firebase_uid:
                # Check if there's metadata with firebase_uid
                metadata = invoice.get('metadata', {})
                if metadata and metadata.get('firebase_uid'):
                    firebase_uid = metadata.get('firebase_uid')
                    print(f"Found firebase_uid in metadata: {firebase_uid}")
            
            # If still no user found, check if there's a client_reference_id
            if not firebase_uid and invoice.get('client_reference_id'):
                firebase_uid = invoice.get('client_reference_id')
                print(f"Using client_reference_id as firebase_uid: {firebase_uid}")
            
            # If still no user found, try to extract from lines data
            if not firebase_uid and invoice.get('lines', {}).get('data'):
                for item in invoice.get('lines', {}).get('data', []):
                    if item.get('metadata', {}).get('firebase_uid'):
                        firebase_uid = item.get('metadata', {}).get('firebase_uid')
                        print(f"Found firebase_uid in line item metadata: {firebase_uid}")
                        break
            
            if not firebase_uid:
                print("Could not determine firebase_uid from invoice data")
                return jsonify({'status': 'success', 'message': 'Event received but no user identified'}), 200
            
            # Update user subscription status
            user_ref = db.collection('Users').document(firebase_uid)
            user_doc = user_ref.get()
            
            if user_doc.exists:
                now = datetime.now()
                subscription_end = now + timedelta(days=30)
                
                update_data = {
                    'subscriptionPlan': 'gold',
                    'trialUsed': True,
                    'trialEndDate': None,
                    'trialStartDate': None,
                    'subscriptionStartDate': now,
                    'subscriptionEndDate': subscription_end,
                    'lastUpdated': now,
                    'stripeCustomerId': customer_id,
                    'stripeSubscriptionId': subscription_id
                }
                
                print(f"Updating user with data: {update_data}")
                user_ref.update(update_data)
                print(f"Successfully updated user {firebase_uid} to gold plan.")
                
                return jsonify({'status': 'success', 'message': 'Subscription updated'}), 200
            else:
                print(f"User document not found for ID: {firebase_uid}")
                
            return jsonify({'status': 'success', 'message': 'Event processed but no user updated'}), 200
            
        except Exception as e:
            print(f"Error processing invoice payment: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': f'Error processing invoice: {str(e)}'}), 500
    
    # Handle other events
    else:
        print(f"Ignoring event type: {event['type']}")

    return jsonify({'status': 'success', 'message': 'Event received'}), 200
def validate_and_clean_record(record, customer_id):
    """Validate and clean a single record"""
    try:
        cleaned_record = {}
        
        # Validate and clean numeric fields
        numeric_fields = {
            'Tenure': {'min': 0, 'max': 61},
            'CityTier': {'min': 1, 'max': 3},
            'WarehouseToHome': {'min': 0, 'max': 100},
            'HourSpendOnApp': {'min': 0, 'max': 24},
            'NumberOfDeviceRegistered': {'min': 0, 'max': 10},
            'SatisfactionScore': {'min': 1, 'max': 5},
            'NumberOfAddress': {'min': 0, 'max': 50},
            'Complain': {'min': 0, 'max': 1},
            'OrderAmountHikeFromlastYear': {'min': 0, 'max': 100},
            'CouponUsed': {'min': 0, 'max': 100},
            'OrderCount': {'min': 0, 'max': 100},
            'DaySinceLastOrder': {'min': 0, 'max': 365},
            'CashbackAmount': {'min': 0, 'max': 1000}
        }
        
        for field, limits in numeric_fields.items():
            value = clean_numeric_value(record.get(field))
            if value < limits['min'] or value > limits['max']:
                return {
                    'has_error': True,
                    'error_message': f"Invalid value for {field}: must be between {limits['min']} and {limits['max']}"
                }
            cleaned_record[field] = value
            
        # Validate and clean categorical fields
        categorical_fields = {
            'PreferredLoginDevice': ['Mobile Phone', 'Tablet Phone', 'Computer'],
            'PreferredPaymentMode': ['Debit Card', 'UPI', 'E wallet', 'Cash on Delivery', 'Credit Card'],
            'Gender': ['Male', 'Female'],
            'PreferedOrderCat': ['Laptop & Accessory', 'Mobile Phone', 'Fashion', 'Grocery', 'Others', 'Mobile'],
            'MaritalStatus': ['Single', 'Married', 'Divorced']
        }
        
        for field, valid_values in categorical_fields.items():
            value = record.get(field)
            if value not in valid_values:
                return {
                    'has_error': True,
                    'error_message': f"Invalid value for {field}: must be one of {', '.join(valid_values)}"
                }
            cleaned_record[field] = value
            
        return cleaned_record
        
    except Exception as e:
        return {
            'has_error': True,
            'error_message': f"Error processing record for customer {customer_id}: {str(e)}"
        }

def get_risk_factors(record):
    """Get risk factors for a customer record"""
    risk_factors = []
    
    if int(record.get('DaySinceLastOrder', 0)) > 14:
        risk_factors.append("Inactive for more than 2 weeks")
    if int(record.get('Tenure', 0)) < 6:
        risk_factors.append("New customer (less than 6 months)")
    if int(record.get('Complain', 0)) > 0:
        risk_factors.append("Has complaints")
    if float(record.get('SatisfactionScore', 5)) <= 3:
        risk_factors.append("Low satisfaction score")
    if int(record.get('OrderCount', 0)) < 2:
        risk_factors.append("Low order count")
    
    return risk_factors

def prepare_features(record):
    """Prepare features for prediction"""
    features = []
    for column in feature_columns:
        if column in categorical_columns:
            # Encode categorical variables
            value = label_encoders[column].transform([record[column]])[0]
        else:
            # Use numeric values directly
            value = record[column]
        features.append(value)
    
    # Scale features
    features = np.array(features).reshape(1, -1)
    return scaler.transform(features)[0]

@app.route('/api/predict-batch', methods=['POST'])
def predict_batch():
    try:
        request_data = request.get_json()
        
        # Validate request data
        if not request_data:
            return jsonify({"error": "No data provided"}), 400
            
        data = request_data.get('data', [])
        customer_ids = request_data.get('customerIds', [])
        
        # Validate batch size
        if len(data) > 1000:  # Maximum 1000 records per batch
            return jsonify({"error": "Batch size exceeds maximum limit of 1000 records"}), 400
            
        if len(data) == 0:
            return jsonify({"error": "Empty batch provided"}), 400

        # Process each record
        predictions = []
        errors = []
        
        for idx, record in enumerate(data):
            try:
                # Extract customer ID
                customer_id = customer_ids[idx] if idx < len(customer_ids) else f'generated_{idx}'
                
                # Validate and clean record
                cleaned_record = validate_and_clean_record(record, customer_id)
                if isinstance(cleaned_record, dict) and cleaned_record.get('has_error'):
                    errors.append({
                        'customerID': customer_id,
                        'error': cleaned_record.get('error_message'),
                        'index': idx
                    })
                    continue

                # Prepare features and make prediction
                features = prepare_features(cleaned_record)
                prediction = model.predict_proba([features])[0]
                churn_probability = float(prediction[1])
                
                # Adjust probability based on risk factors
                adjusted_probability, risk_factors = adjust_probability(churn_probability, cleaned_record)
                
                # Create prediction result
                prediction_result = {
                    'customerID': customer_id,
                    'prediction': 1 if adjusted_probability >= 0.5 else 0,
                    'churnProbability': adjusted_probability,
                    'stayProbability': 1 - adjusted_probability,
                    'predictionLabel': "Likely to Churn" if adjusted_probability >= 0.5 else "Likely to Stay",
                    'confidenceScore': max(adjusted_probability, 1 - adjusted_probability),
                    'riskFactors': risk_factors
                }
                
                predictions.append(prediction_result)
                
            except Exception as e:
                errors.append({
                    'customerID': customer_id,
                    'error': str(e),
                    'index': idx
                })

        # Return results
        response = {
            'predictions': predictions,
            'errors': errors,
            'summary': {
                'total': len(data),
                'successful': len(predictions),
                'failed': len(errors)
            }
        }
        
        return jsonify(response)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/create-checkout-session', methods=['POST'])
def create_checkout_session():
    data = request.json
    firebase_uid = data.get('firebase_uid')
    email = data.get('email')
    if not firebase_uid or not email:
        return jsonify({'error': 'Missing user information'}), 400

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            mode='subscription',
            line_items=[{
                'price': os.getenv('REACT_APP_STRIPE_GOLD_PLAN_PRICE'),  # Stripe price ID for gold plan
                'quantity': 1,
            }],
            customer_email=email,
            metadata={'firebase_uid': firebase_uid},
            success_url=f"{data.get('success_url')}?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=data.get('cancel_url'),
        )
        return jsonify({'url': session.url})
    except Exception as e:
        print(f"Error creating Stripe session: {e}")
        return jsonify({'error': str(e)}), 500

# Serve React app - this should be at the end of all API routes
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    # If the path starts with api/, return 404 as it should be handled by API routes
    if path.startswith('api/'):
        return jsonify({"error": "API endpoint not found"}), 404
        
    # For non-API routes, try to serve static files
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    
    # For all other routes (including unknown paths), serve index.html
    try:
        return send_file(os.path.join(app.static_folder, 'index.html'))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)