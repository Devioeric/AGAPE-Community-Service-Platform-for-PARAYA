export type PHBarangay = { name: string; lat?: number; lng?: number };

// All Philippine provinces (sorted alphabetically by region)
export const PH_PROVINCES: string[] = [
  // NCR
  "Metro Manila",
  // CAR
  "Abra", "Apayao", "Benguet", "Ifugao", "Kalinga", "Mountain Province",
  // Region I
  "Ilocos Norte", "Ilocos Sur", "La Union", "Pangasinan",
  // Region II
  "Batanes", "Cagayan", "Isabela", "Nueva Vizcaya", "Quirino",
  // Region III
  "Aurora", "Bataan", "Bulacan", "Nueva Ecija", "Pampanga", "Tarlac", "Zambales",
  // Region IV-A CALABARZON
  "Batangas", "Cavite", "Laguna", "Quezon", "Rizal",
  // Region IV-B MIMAROPA
  "Marinduque", "Occidental Mindoro", "Oriental Mindoro", "Palawan", "Romblon",
  // Region V Bicol
  "Albay", "Camarines Norte", "Camarines Sur", "Catanduanes", "Masbate", "Sorsogon",
  // Region VI Western Visayas
  "Aklan", "Antique", "Capiz", "Guimaras", "Iloilo", "Negros Occidental",
  // Region VII Central Visayas
  "Bohol", "Cebu", "Negros Oriental", "Siquijor",
  // Region VIII Eastern Visayas
  "Biliran", "Eastern Samar", "Leyte", "Northern Samar", "Samar", "Southern Leyte",
  // Region IX Zamboanga Peninsula
  "Zamboanga del Norte", "Zamboanga del Sur", "Zamboanga Sibugay",
  // Region X Northern Mindanao
  "Bukidnon", "Camiguin", "Lanao del Norte", "Misamis Occidental", "Misamis Oriental",
  // Region XI Davao
  "Davao de Oro", "Davao del Norte", "Davao del Sur", "Davao Occidental", "Davao Oriental",
  // Region XII SOCCSKSARGEN
  "Cotabato", "Sarangani", "South Cotabato", "Sultan Kudarat",
  // Region XIII Caraga
  "Agusan del Norte", "Agusan del Sur", "Dinagat Islands", "Surigao del Norte", "Surigao del Sur",
  // BARMM
  "Basilan", "Lanao del Sur", "Maguindanao del Norte", "Maguindanao del Sur", "Sulu", "Tawi-Tawi",
];

// Province → list of municipalities/cities
export const PH_MUNICIPALITIES: Record<string, string[]> = {
  "Metro Manila": [
    "Caloocan", "Las Piñas", "Makati", "Malabon", "Mandaluyong", "Manila",
    "Marikina", "Muntinlupa", "Navotas", "Parañaque", "Pasay", "Pasig",
    "Pateros", "Quezon City", "San Juan", "Taguig", "Valenzuela",
  ],
  "Bulacan": [
    "Angat", "Balagtas", "Baliuag", "Bocaue", "Bulacan", "Bulakan",
    "Calumpit", "Doña Remedios Trinidad", "Guiguinto", "Hagonoy",
    "Malolos", "Marilao", "Meycauayan", "Norzagaray", "Obando",
    "Pandi", "Paombong", "Plaridel", "Pulilan", "San Ildefonso",
    "San Jose del Monte", "San Miguel", "San Rafael", "Santa Maria",
  ],
  "Pampanga": [
    "Angeles", "Apalit", "Arayat", "Bacolor", "Candaba", "Floridablanca",
    "Guagua", "Lubao", "Mabalacat", "Macabebe", "Magalang", "Masantol",
    "Mexico", "Minalin", "Porac", "San Fernando", "San Luis", "San Simon",
    "Santa Ana", "Santa Rita", "Santo Tomas", "Sasmuan",
  ],
  "Rizal": [
    "Angono", "Antipolo", "Baras", "Binangonan", "Cainta", "Cardona",
    "Jala-Jala", "Morong", "Pililla", "Rodriguez", "San Mateo", "Taytay",
    "Teresa", "Tanay",
  ],
  "Cavite": [
    "Alfonso", "Amadeo", "Bacoor", "Carmona", "Cavite City", "Dasmariñas",
    "General Emilio Aguinaldo", "General Mariano Alvarez", "General Trias",
    "Imus", "Indang", "Kawit", "Magallanes", "Maragondon", "Mendez",
    "Naic", "Noveleta", "Rosario", "Silang", "Tagaytay", "Tanza", "Ternate", "Trece Martires",
  ],
  "Laguna": [
    "Alaminos", "Bay", "Biñan", "Cabuyao", "Calamba", "Calauan", "Cavinti",
    "Famy", "Kalayaan", "Liliw", "Los Baños", "Luisiana", "Lumban",
    "Mabitac", "Magdalena", "Majayjay", "Nagcarlan", "Paete", "Pagsanjan",
    "Pakil", "Pangil", "Pila", "Rizal", "San Pablo", "San Pedro",
    "Santa Cruz", "Santa Maria", "Santa Rosa", "Siniloan", "Victoria",
  ],
  "Batangas": [
    "Agoncillo", "Alitagtag", "Balayan", "Balete", "Batangas City", "Bauan",
    "Calaca", "Calatagan", "Cuenca", "Ibaan", "Laurel", "Lemery", "Lian",
    "Lipa", "Lobo", "Mabini", "Malvar", "Mataasnakahoy", "Nasugbu",
    "Padre Garcia", "Rosario", "San Jose", "San Juan", "San Luis",
    "San Nicolas", "San Pascual", "Santa Teresita", "Santo Tomas",
    "Taal", "Talisay", "Taysan", "Tingloy", "Tuy",
  ],
};

// Municipality → barangays (with coordinates where known)
// Coordinates for Bocaue barangays are approximate centers; verify via Google Maps.
export const PH_BARANGAYS: Record<string, PHBarangay[]> = {
  "Bocaue": [
    { name: "Antipona",   lat: 14.7921, lng: 120.9288 },
    { name: "Bagumbayan", lat: 14.7982, lng: 120.9262 },
    { name: "Bambang",    lat: 14.8031, lng: 120.9233 },
    { name: "Batia",      lat: 14.8052, lng: 120.9312 },
    { name: "Biñang 1st", lat: 14.7952, lng: 120.9222 },
    { name: "Biñang 2nd", lat: 14.7937, lng: 120.9203 },
    { name: "Bolacan",    lat: 14.8025, lng: 120.9358 },
    { name: "Bundukan",   lat: 14.7940, lng: 120.9268 },
    { name: "Bunlo",      lat: 14.7948, lng: 120.9172 },
    { name: "Caingin",    lat: 14.7962, lng: 120.9337 },
    { name: "Duhat",      lat: 14.8012, lng: 120.9168 },
    { name: "Igulot",     lat: 14.8072, lng: 120.9178 },
    { name: "Lolomboy",   lat: 14.7909, lng: 120.9182 },
    { name: "Poblacion",  lat: 14.7975, lng: 120.9281 },
    { name: "Sulucan",    lat: 14.8062, lng: 120.9291 },
    { name: "Taal",       lat: 14.7972, lng: 120.9332 },
    { name: "Tambobong",  lat: 14.8041, lng: 120.9182 },
    { name: "Turo",       lat: 14.7901, lng: 120.9311 },
    { name: "Wakas",      lat: 14.7963, lng: 120.9350 },
  ],
  "Marilao": [
    { name: "Abangan Norte" }, { name: "Abangan Sur" }, { name: "Bahay Pare" },
    { name: "Bancal" }, { name: "Bayan ng Marilao" }, { name: "Biñang 1st" },
    { name: "Biñang 2nd" }, { name: "Bolacan" }, { name: "Burol 1st" },
    { name: "Burol 2nd" }, { name: "Burol 3rd" }, { name: "Catanghalan" },
    { name: "Dakila" }, { name: "Ibayo" }, { name: "Lias" },
    { name: "Lico" }, { name: "Longos" }, { name: "Look 1st" },
    { name: "Look 2nd" }, { name: "Lugam" }, { name: "Mabolo" },
    { name: "Panasahan" }, { name: "Patubig" }, { name: "Poblacion" },
    { name: "Pulong Buhangin" }, { name: "Pulong Yantok" }, { name: "Saog" },
    { name: "Santa Rosa 1st" }, { name: "Santa Rosa 2nd" }, { name: "Tabing Ilog" },
    { name: "Tumana" },
  ],
  "Meycauayan": [
    { name: "Bagbaguin" }, { name: "Bahay Pare" }, { name: "Bancal" },
    { name: "Banga" }, { name: "Bayugo" }, { name: "Caingin" },
    { name: "Calvario" }, { name: "Camalig" }, { name: "Gasak" },
    { name: "Hulo" }, { name: "Iba" }, { name: "Langka" },
    { name: "Lawa" }, { name: "Libtong" }, { name: "Liputan" },
    { name: "Longos" }, { name: "Malhacan" }, { name: "Pajo" },
    { name: "Pandayan" }, { name: "Pantoc" }, { name: "Perez" },
    { name: "Poblacion" }, { name: "Saluysoy" }, { name: "San Francisco" },
    { name: "Tugatog" }, { name: "Ubihan" }, { name: "Zamora" },
  ],
  "Malolos": [
    { name: "Anilao" }, { name: "Atlag" }, { name: "Babatnin" },
    { name: "Bagna" }, { name: "Bagong Bayan" }, { name: "Balayong" },
    { name: "Balite" }, { name: "Bangkal" }, { name: "Barihan" },
    { name: "Bulihan" }, { name: "Bungahan" }, { name: "Caingin" },
    { name: "Calero" }, { name: "Calizon" }, { name: "Canlaon" },
    { name: "Catmon" }, { name: "Cofradia" }, { name: "Dakila" },
    { name: "Guinhawa" }, { name: "Ligas" }, { name: "Liyang" },
    { name: "Longos" }, { name: "Look 1st" }, { name: "Lugam" },
    { name: "Mabolo" }, { name: "Mambog" }, { name: "Masile" },
    { name: "Matimbo" }, { name: "Mojon" }, { name: "Namayan" },
    { name: "Niugan" }, { name: "Pamarawan" }, { name: "Panasahan" },
    { name: "Pinambaran" }, { name: "Poblacion" }, { name: "Saluysoy" },
    { name: "San Agustin" }, { name: "San Gabriel" }, { name: "San Juan" },
    { name: "San Pablo" }, { name: "San Vicente" }, { name: "Santiago" },
    { name: "Santisima Trinidad" }, { name: "Santo Niño" }, { name: "Santo Rosario" },
    { name: "Santol" }, { name: "Sumapang Bata" }, { name: "Sumapang Matanda" },
    { name: "Taal" }, { name: "Tikay" },
  ],
};
