import 'dart:ui';
import 'package:flutter/material.dart';

void main() {
  runApp(const QuoteApp());
}

class QuoteApp extends StatelessWidget {
  const QuoteApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark(),
      home: const QuoteHomePage(),
    );
  }
}

class QuoteHomePage extends StatefulWidget {
  const QuoteHomePage({super.key});

  @override
  State<QuoteHomePage> createState() => _QuoteHomePageState();
}

class _QuoteHomePageState extends State<QuoteHomePage> {
  final List<String> quotes = [
    "Life is like riding a bicycle. To keep your balance, you must keep moving.",
    "The future depends on what you do today.",
    "Don’t watch the clock; do what it does. Keep going.",
    "Success is not for the lazy.",
    "Push yourself, because no one else is going to do it for you.",
    "Great things never come from comfort zones.",
    "Believe you can and you're halfway there.",
  ];

  String currentQuote = "Life is like riding a bicycle. To keep your balance, you must keep moving.";
  List<String> favorites = [];
  int selectedIndex = 0;

  void newQuote() {
    setState(() {
      quotes.shuffle();
      currentQuote = quotes.first;
    });
  }

  void toggleFavorite() {
    setState(() {
      if (favorites.contains(currentQuote)) {
        favorites.remove(currentQuote); // Remove if already in favorites
      } else {
        favorites.add(currentQuote); // Add if not in favorites
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF121212),
      body: selectedIndex == 0 ? quoteUI() : favoritePageUI(),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: selectedIndex,
        selectedItemColor: Colors.redAccent,
        onTap: (index) => setState(() => selectedIndex = index),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.format_quote), label: "Quotes"),
          BottomNavigationBarItem(icon: Icon(Icons.favorite), label: "Favourite"),
        ],
      ),
    );
  }

  // MAIN SCREEN — Dark + Glass Quote Card
  Widget quoteUI() {
    return Padding(
      padding: const EdgeInsets.all(26),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(25),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
              child: Container(
                padding: const EdgeInsets.all(30),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.10),
                  borderRadius: BorderRadius.circular(25),
                  border: Border.all(color: Colors.white.withOpacity(0.3)),
                ),
                child: Text(
                  "\"$currentQuote\"",
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 26,
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 40),

          ElevatedButton(
            onPressed: newQuote,
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 50, vertical: 18),
              backgroundColor: Colors.redAccent,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(25)),
            ),
            child: const Text("Next Quote", style: TextStyle(fontSize: 18)),
          ),

          const SizedBox(height: 15),

          IconButton(
            onPressed: toggleFavorite,
            icon: Icon(
              favorites.contains(currentQuote)
                  ? Icons.favorite
                  : Icons.favorite_border,
              color: Colors.redAccent,
            ),
            iconSize: 45,
          ),
        ],
      ),
    );
  }

  // FAVORITE PAGE — Neon Cards
  Widget favoritePageUI() {
    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: favorites.length,
      itemBuilder: (context, index) {
        return Card(
          color: Colors.white.withOpacity(0.08),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              favorites[index],
              style: const TextStyle(fontSize: 18, color: Colors.white),
              textAlign: TextAlign.center,
            ),
          ),
        );
      },
    );
  }
}
