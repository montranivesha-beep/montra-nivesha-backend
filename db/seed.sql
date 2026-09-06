-- Seed data matching the Montra Nivesha prototype defaults.
-- Passwords below are the bcrypt hash of the demo passwords used in the prototype
-- (admin123, waiter123, etc.) — see README for the plaintext list, and change
-- them immediately in any real deployment.

-- ===== Sections =====
INSERT INTO sections (id, name, description, open_time, close_time) VALUES
  ('sk', 'Amok Khmer Cuisine', 'Indoor fine dining open air', '11:00', '22:00'),
  ('sr', 'Sokhalay', 'Private dining rooms with air-conditioned', '17:00', '22:00'),
  ('af', 'Arun', 'Indoor fine dining, air-conditioned', '06:00', '10:00');

-- ===== Tables =====
INSERT INTO tables (id, section_id, capacity) VALUES
  ('SK-1','sk',2), ('SK-2','sk',2), ('SK-3','sk',4), ('SK-4','sk',4),
  ('SK-5','sk',4), ('SK-6','sk',4), ('SK-7','sk',6), ('SK-8','sk',6),
  ('SR-1','sr',8), ('SR-2','sr',8), ('SR-3','sr',4), ('SR-4','sr',4),
  ('AF-1','af',2), ('AF-2','af',2), ('AF-3','af',4), ('AF-4','af',4),
  ('AF-5','af',4), ('AF-6','af',6);

UPDATE tables SET status='occupied' WHERE id='SK-3';
UPDATE tables SET status='reserved' WHERE id='SK-5';
UPDATE tables SET status='cleaning' WHERE id='AF-2';
UPDATE tables SET status='occupied' WHERE id='SR-1';

-- ===== Rooms (46-room property) =====
INSERT INTO rooms (id) SELECT generate_series(101,111)::text UNION ALL
                       SELECT generate_series(201,212)::text UNION ALL
                       SELECT generate_series(301,312)::text UNION ALL
                       SELECT generate_series(401,411)::text;

-- ===== Menu categories (serving order) =====
INSERT INTO menu_categories (name, sort_order) VALUES
  ('Appetisers',0), ('Khmer Signature',1), ('Grill & Mains',2),
  ('Desserts',3), ('Beverages',4), ('Breakfast',5);

-- ===== Menu items =====
INSERT INTO menu_items (name, category, price, cost, section_id, modifiers) VALUES
  ('Fresh Spring Rolls','Appetisers',6.5,1.9,NULL,NULL),
  ('Bai Sach Chrouk (Grilled Pork & Rice)','Appetisers',7.0,2.3,NULL,NULL),
  ('Nom Banh Chok, Siem Reap style','Appetisers',6.0,1.7,NULL,NULL),
  ('Amok Trey (Steamed Fish Curry)','Khmer Signature',14.0,4.8,NULL,'Mild, Medium, Spicy'),
  ('Lok Lak Beef','Khmer Signature',13.0,4.5,NULL,'Beef, Chicken'),
  ('Khmer Red Curry','Khmer Signature',12.5,4.0,NULL,NULL),
  ('Grilled Kampot Pepper Steak','Grill & Mains',18.0,6.7,NULL,'Rare, Medium, Well done'),
  ('Grilled River Prawns','Grill & Mains',19.5,7.9,NULL,NULL),
  ('Wok-fried Morning Glory','Grill & Mains',8.0,2.1,NULL,NULL),
  ('Coconut Sticky Rice & Mango','Desserts',6.0,1.6,NULL,NULL),
  ('Palm Sugar Crème Brûlée','Desserts',6.5,1.8,NULL,NULL),
  ('Lemongrass Iced Tea','Beverages',3.5,0.6,NULL,NULL),
  ('Fresh Coconut','Beverages',4.0,1.1,NULL,NULL),
  ('Cambodian Craft Beer','Beverages',5.0,1.5,NULL,NULL),
  ('Continental Breakfast Plate','Breakfast',9.0,3.0,'af',NULL),
  ('Khmer Rice Porridge (Borbor)','Breakfast',6.0,2.0,'af','Chicken, Fish, Plain'),
  ('Eggs Benedict','Breakfast',10.0,3.4,'af',NULL),
  ('Fresh Fruit Platter','Breakfast',5.0,1.6,'af',NULL),
  ('Croissant & Pastry Basket','Breakfast',6.0,2.0,'af',NULL),
  ('Fresh Juice & Coffee','Breakfast',4.0,1.0,'af','Orange, Watermelon, Pineapple');

-- Staff accounts are seeded by scripts/seed.js (not here), so real bcrypt
-- hashes can be generated at seed time instead of hardcoding placeholders.

-- ===== Role permissions (which nav functions each role can access) =====
INSERT INTO role_permissions (role, function) VALUES
  ('admin','floorplan'),('admin','orders'),('admin','reservations'),('admin','catering'),
  ('admin','menu'),('admin','qr'),('admin','reports'),('admin','feedback'),
  ('admin','cityledger'),('admin','users'),
  ('waiter','floorplan'),('waiter','orders'),('waiter','reservations'),('waiter','catering'),('waiter','qr'),
  ('cashier','orders'),('cashier','cityledger'),
  ('kitchen','orders'),
  ('reservationManager','floorplan'),('reservationManager','reservations'),('reservationManager','catering'),('reservationManager','qr'),
  ('reservationStaff','floorplan'),('reservationStaff','reservations'),('reservationStaff','catering'),('reservationStaff','qr'),
  ('restaurantManager','floorplan'),('restaurantManager','orders'),('restaurantManager','reservations'),
  ('restaurantManager','catering'),('restaurantManager','menu'),('restaurantManager','qr'),
  ('restaurantManager','reports'),('restaurantManager','cityledger'),
  ('headKitchen','orders'),('headKitchen','menu'),('headKitchen','reports'),
  ('finance','reports'),('finance','cityledger');

-- ===== City ledger accounts =====
INSERT INTO city_ledger_accounts (name, contact, credit_limit) VALUES
  ('Hanuman Travel','Reservations desk',2000),
  ('GoVacation Cambodia','Accounts payable',1500);

-- ===== Venues =====
INSERT INTO venues (name, capacity, rental_fee) VALUES
  ('Garden Pavilion',120,300),
  ('Rooftop Terrace',60,200),
  ('Riverside Lawn',150,350);

-- ===== Catering packages =====
INSERT INTO catering_packages (name, price_per_guest, cost_per_guest, description) VALUES
  ('Khmer Buffet Feast',18,7,'Traditional Khmer buffet with signature dishes'),
  ('Cocktail & Canapés',22,9,'Passed canapés and open bar reception'),
  ('Set Wedding Menu',35,14,'Multi-course plated wedding dinner'),
  ('Coffee Break Package',8,3,'Meeting and conference coffee break');

-- ===== Additional services =====
INSERT INTO additional_services (name, rate, cost, description) VALUES
  ('AV & Sound Equipment',80,30,'Microphones, speakers, projector'),
  ('Floral & Decoration',120,50,'Table centerpieces and stage backdrop'),
  ('Photography Package',150,60,'3-hour event photography coverage'),
  ('Extra Waitstaff (per staff)',25,10,'Additional service staff for the event');

-- ===== Business sources =====
INSERT INTO business_sources (name) VALUES
  ('Direct / Walk-in'),('Travel Agency'),('Corporate'),
  ('Wedding Planner'),('Online / Website'),('Repeat Client'),('Other');
