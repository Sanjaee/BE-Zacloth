import express from "express";
import cors from "cors";

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

// Dummy data untuk 10 produk
const hydratedProducts = [
  {
    isOnSale: false,
    catalogId: "a892da45-666a-4334-9325-820d1d47fa7e",
    isNikeByYou: false,
    brand: "Nike",
    category: "APPAREL",
    cloudProductId: "1c152dfc-028a-537b-b342-f998c3eba26b",
    color: "HJ3660-010",
    country: "id",
    currentPrice: 399000,
    fullPrice: 399000,
    genders: ["MEN"],
    name: "AS M NK DF TEE RUN ENERGY SP25",
    prodigyId: "1015667186",
    imageUrl:
      "https://static.nike.com/a/images/t_PDP_1280_v1/f_auto,q_auto:eco/78f2022f-5ac6-48fb-9b8c-3a4f2780f4a2/image.png",
    skuData: [
      { size: "S", sku: "d17d556a-17e9-5cf4-8921-73de21867632", gtin: "00197860173316" },
      { size: "M", sku: "679b17a1-bb17-5d8a-b570-1ee94c5be086", gtin: "00197860175440" },
      { size: "L", sku: "192601e5-7bf2-538d-932f-9b474d501280", gtin: "00197860196261" },
      { size: "XL", sku: "15ed736f-cc14-5fed-a7c3-3fabe0d2c787", gtin: "00197860169531" },
    ],
    subCategory: ["Running"],
  },
  {
    isOnSale: true,
    catalogId: "c342da45-123a-4334-9325-920d1d47fa7e",
    isNikeByYou: false,
    brand: "Nike",
    category: "APPAREL",
    cloudProductId: "2d352dfc-018a-537b-b342-f998c3eba21b",
    color: "DR9876-100",
    country: "id",
    currentPrice: 599000,
    fullPrice: 799000,
    genders: ["WOMEN"],
    name: "Nike One Luxe Leggings",
    prodigyId: "2015667123",
    imageUrl:
      "https://static.nike.com/a/images/t_PDP_1280_v1/f_auto,q_auto:eco/72c96c71-6c61-47aa-8226-38fef5d60e43/image.png",
    skuData: [
      { size: "XS", sku: "x12d556a-17e9-5cf4-8921-73de21867888", gtin: "00197860173317" },
      { size: "S", sku: "x22b17a1-bb17-5d8a-b570-1ee94c5be087", gtin: "00197860175441" },
      { size: "M", sku: "x32b17a1-bb17-5d8a-b570-1ee94c5be088", gtin: "00197860175442" },
    ],
    subCategory: ["Training"],
  },
  {
    isOnSale: false,
    catalogId: "b123cd56-789e-4567-8901-234f567890ab",
    isNikeByYou: false,
    brand: "Nike",
    category: "FOOTWEAR",
    cloudProductId: "3e456fgh-039b-648c-c453-g009d4fbc37c",
    color: "DD1391-100",
    country: "id",
    currentPrice: 1549000,
    fullPrice: 1549000,
    genders: ["MEN", "WOMEN"],
    name: "Nike Dunk Low Retro",
    prodigyId: "3026778234",
    imageUrl:
      "https://static.nike.com/a/images/t_PDP_1280_v1/f_auto,q_auto:eco/4f37fca8-6bce-43e7-8774-4501ba895204/dunk-low-retro-shoe-68vX23.png",
    skuData: [
      { size: "40", sku: "sku-dunk-40", gtin: "gtin-dunk-40" },
      { size: "41", sku: "sku-dunk-41", gtin: "gtin-dunk-41" },
      { size: "42", sku: "sku-dunk-42", gtin: "gtin-dunk-42" },
    ],
    subCategory: ["Lifestyle"],
  },
  {
    isOnSale: true,
    catalogId: "d456ef78-123a-4bcd-89ef-012g345h67ij",
    isNikeByYou: false,
    brand: "Nike",
    category: "APPAREL",
    cloudProductId: "4f567ghi-040c-759d-d564-h110e5gcd48d",
    color: "BV2662-063",
    country: "id",
    currentPrice: 650000,
    fullPrice: 800000,
    genders: ["MEN"],
    name: "Nike Sportswear Club Fleece",
    prodigyId: "4037889345",
    imageUrl:
      "https://static.nike.com/a/images/t_PDP_1280_v1/f_auto,q_auto:eco/d3f74b6a-4933-4458-9128-56c55205504c/sportswear-club-fleece-pullover-hoodie-80gFpL.png",
    skuData: [
        { size: "S", sku: "sku-hoodie-s", gtin: "gtin-hoodie-s" },
        { size: "M", sku: "sku-hoodie-m", gtin: "gtin-hoodie-m" },
        { size: "L", sku: "sku-hoodie-l", gtin: "gtin-hoodie-l" },
    ],
    subCategory: ["Lifestyle"],
  },
  {
    isOnSale: false,
    catalogId: "e789fg01-234b-4def-90ab-123h456i78jk",
    isNikeByYou: false,
    brand: "Nike",
    category: "FOOTWEAR",
    cloudProductId: "5g678hij-051d-860e-e675-i221f6hde59e",
    color: "CW5419-100",
    country: "id",
    currentPrice: 1729000,
    fullPrice: 1729000,
    genders: ["MEN"],
    name: "Nike Air Max 90",
    prodigyId: "5048990456",
    imageUrl:
      "https://static.nike.com/a/images/t_PDP_1280_v1/f_auto,q_auto:eco/a994ba39-82f7-4171-8c65-71701a5f4e5a/air-max-90-shoes-N7T1rC.png",
    skuData: [
      { size: "42", sku: "sku-am90-42", gtin: "gtin-am90-42" },
      { size: "43", sku: "sku-am90-43", gtin: "gtin-am90-43" },
      { size: "44", sku: "sku-am90-44", gtin: "gtin-am90-44" },
    ],
    subCategory: ["Lifestyle"],
  },
  {
    isOnSale: false,
    catalogId: "f012gh34-345c-4fgh-a1bc-234i567j89kl",
    isNikeByYou: false,
    brand: "Nike",
    category: "ACCESSORIES",
    cloudProductId: "6h789ijk-062e-971f-f786-j332g7ief60f",
    color: "N.100.0586.082.OS",
    country: "id",
    currentPrice: 329000,
    fullPrice: 329000,
    genders: ["MEN", "WOMEN"],
    name: "Nike Everyday Plus Cushioned",
    prodigyId: "6059001567",
    imageUrl:
      "https://static.nike.com/a/images/t_PDP_1280_v1/f_auto,q_auto:eco/509b23c2-0b7a-4e2a-8094-7e87a552b7c6/everyday-plus-cushioned-training-crew-socks-6-pairs-vJ4dG4.png",
    skuData: [
      { size: "One Size", sku: "sku-socks-os", gtin: "gtin-socks-os" },
    ],
    subCategory: ["Socks"],
  },
  {
    isOnSale: true,
    catalogId: "g345hi67-456d-4ijk-b2cd-345j678k90lm",
    isNikeByYou: false,
    brand: "Nike",
    category: "FOOTWEAR",
    cloudProductId: "7i890jkl-073f-082g-g897-k443h8jfg71g",
    color: "DH8010-001",
    country: "id",
    currentPrice: 1999000,
    fullPrice: 2489000,
    genders: ["MEN"],
    name: "Nike Air Zoom Pegasus 39",
    prodigyId: "7060112678",
    imageUrl:
      "https://static.nike.com/a/images/t_PDP_1280_v1/f_auto,q_auto:eco/b182676b-b78f-4318-a15d-31215b2447fa/air-zoom-pegasus-39-road-running-shoes-fRzz2h.png",
    skuData: [
      { size: "41", sku: "sku-pegasus-41", gtin: "gtin-pegasus-41" },
      { size: "42.5", sku: "sku-pegasus-425", gtin: "gtin-pegasus-425" },
      { size: "44", sku: "sku-pegasus-44", gtin: "gtin-pegasus-44" },
    ],
    subCategory: ["Running"],
  },
  {
    isOnSale: false,
    catalogId: "h678ij90-567e-4lmn-c3de-456k789l01mn",
    isNikeByYou: false,
    brand: "Jordan",
    category: "FOOTWEAR",
    cloudProductId: "8j901klm-084g-193h-h908-l554i9khh82h",
    color: "553558-164",
    country: "id",
    currentPrice: 1899000,
    fullPrice: 1899000,
    genders: ["MEN"],
    name: "Air Jordan 1 Low",
    prodigyId: "8071223789",
    imageUrl:
      "https://static.nike.com/a/images/t_PDP_1280_v1/f_auto,q_auto:eco/c968a48b-7009-4847-9dc4-1823a516082a/air-jordan-1-low-shoes-6Q1tK4.png",
    skuData: [
      { size: "40", sku: "sku-aj1low-40", gtin: "gtin-aj1low-40" },
      { size: "41", sku: "sku-aj1low-41", gtin: "gtin-aj1low-41" },
      { size: "42", sku: "sku-aj1low-42", gtin: "gtin-aj1low-42" },
    ],
    subCategory: ["Basketball"],
  },
  {
    isOnSale: false,
    catalogId: "i901jk23-678f-4opq-d4ef-567l890m12no",
    isNikeByYou: false,
    brand: "Nike",
    category: "APPAREL",
    cloudProductId: "9k012lmn-095h-204i-i019-m665j0lii93i",
    color: "DX0522-010",
    country: "id",
    currentPrice: 549000,
    fullPrice: 549000,
    genders: ["WOMEN"],
    name: "Nike Dri-FIT One",
    prodigyId: "9082334890",
    imageUrl:
      "https://static.nike.com/a/images/t_PDP_1280_v1/f_auto,q_auto:eco/64506e90-091f-4318-8777-6953c84715f3/dri-fit-one-standard-fit-short-sleeve-top-p7Jkcf.png",
    skuData: [
      { size: "S", sku: "sku-dfone-s", gtin: "gtin-dfone-s" },
      { size: "M", sku: "sku-dfone-m", gtin: "gtin-dfone-m" },
      { size: "L", sku: "sku-dfone-l", gtin: "gtin-dfone-l" },
    ],
    subCategory: ["Training"],
  },
  {
    isOnSale: true,
    catalogId: "j234kl56-789g-4rst-e5fg-678m901n23pq",
    isNikeByYou: false,
    brand: "Nike",
    category: "ACCESSORIES",
    cloudProductId: "0l123mno-106i-315j-j120-n776k1mjj04j",
    color: "J.100.8529.082.OS",
    country: "id",
    currentPrice: 250000,
    fullPrice: 359000,
    genders: ["MEN", "WOMEN"],
    name: "Jordan Legacy91",
    prodigyId: "0193445901",
    imageUrl:
      "https://static.nike.com/a/images/t_PDP_1280_v1/f_auto,q_auto:eco/c828d541-5d07-4861-a185-937b420f1c9c/jordan-legacy91-jumpman-air-cap-jV0fCf.png",
    skuData: [
      { size: "One Size", sku: "sku-cap-os", gtin: "gtin-cap-os" },
    ],
    subCategory: ["Cap"],
  },
];


// Endpoint
app.get("/", (req, res) => {
  res.send("Selamat datang di Dummy Product API!");
});

app.get("/products", (req, res) => {
  res.json(hydratedProducts);
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
